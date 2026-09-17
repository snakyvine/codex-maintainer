import { readdir, lstat, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { GitHubClient, type TreeFile } from '../github/client.js';
import { includedPath } from '../core/security.js';
import { readBounded, optionalFile } from '../core/files.js';
import { MaintainerError } from '../core/errors.js';

export interface RepositorySource {
  readonly repository: string;
  readonly ref: string;
  readonly files: readonly TreeFile[];
  readonly truncated: boolean;
  read(path: string, maxBytes: number): Promise<string | undefined>;
}

export class RemoteSource implements RepositorySource {
  private readonly lookup: Map<string, TreeFile>;
  private readonly cache = new Map<string, string | undefined>();
  private constructor(private readonly github: GitHubClient, readonly ref: string, readonly files: TreeFile[], readonly truncated: boolean) {
    this.lookup = new Map(files.map((file) => [file.path, file]));
  }
  get repository(): string { return this.github.repo.fullName; }
  static async create(github: GitHubClient, ref?: string): Promise<RemoteSource> {
    const resolved = ref ?? await github.defaultRef();
    const tree = await github.tree(resolved);
    return new RemoteSource(github, resolved, tree.files, tree.truncated);
  }
  async read(path: string, maxBytes: number): Promise<string | undefined> {
    const file = this.lookup.get(path);
    if (!file || file.size > maxBytes) return undefined;
    const key = `${path}:${maxBytes}`;
    if (!this.cache.has(key)) this.cache.set(key, await this.github.blob(file, maxBytes));
    return this.cache.get(key);
  }
}

export class LocalSource implements RepositorySource {
  readonly ref: string;
  private readonly paths: Set<string>;
  private constructor(private readonly root: string, readonly repository: string, readonly files: TreeFile[], readonly truncated: boolean) {
    this.paths = new Set(files.map((file) => file.path));
    // Local snapshots are not interchangeable with remote commit-pinned contexts.
    this.ref = `local:${createHash('sha256').update(JSON.stringify(files)).digest('hex')}`;
  }
  static async create(root: string, exclude: readonly string[] = []): Promise<LocalSource> {
    const resolvedRoot = await realpath(root);
    const files: TreeFile[] = [];
    let visited = 0;
    let truncated = false;
    async function walk(directory: string, depth = 0): Promise<void> {
      if (depth > 30 || visited >= 30_000) { truncated = true; return; }
      const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (++visited > 30_000 || files.length >= 20_000) { truncated = true; return; }
        const absolute = join(directory, entry.name);
        const path = relative(resolvedRoot, absolute).split(sep).join('/');
        if (entry.isSymbolicLink() || !includedPath(path, exclude)) continue;
        if (entry.isDirectory()) await walk(absolute, depth + 1);
        else if (entry.isFile()) {
          const info = await lstat(absolute);
          files.push({ path, size: info.size, sha: `local:${info.size}:${info.mtimeMs}` });
        }
      }
    }
    await walk(resolvedRoot);
    return new LocalSource(resolvedRoot, await inferRepository(resolvedRoot) ?? 'local', files, truncated);
  }
  async read(path: string, maxBytes: number): Promise<string | undefined> {
    if (!this.paths.has(path)) return undefined;
    const target = join(this.root, path);
    // Check each ancestor on every read; a symlink directory must not escape the repository.
    let ancestor = this.root;
    for (const part of path.split('/').slice(0, -1)) {
      ancestor = join(ancestor, part);
      const stat = await lstat(ancestor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new MaintainerError('UNSAFE', 'Repository directory changed into a symlink.');
    }
    const info = await lstat(target);
    if (info.size > maxBytes || !info.isFile() || info.isSymbolicLink()) return undefined;
    const text = await readBounded(target, maxBytes);
    return text.includes('\0') ? undefined : text;
  }
}

/** No git process, hooks, credential helpers or repository programs are executed. */
export async function inferRepository(root: string): Promise<string | undefined> {
  try {
    const gitDir = await lstat(join(root, '.git'));
    if (!gitDir.isDirectory() || gitDir.isSymbolicLink()) return undefined;
    const config = await optionalFile(join(root, '.git', 'config'), 100_000);
    const origin = config?.match(/\[remote\s+"origin"\]([^\[]*)/)?.[1]?.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
    return origin?.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/)?.[1];
  } catch { return undefined; }
}
