import { readdir, lstat, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { includedPath } from '../core/security.js';
import { readBounded, optionalFile } from '../core/files.js';
import { MaintainerError } from '../core/errors.js';
export class RemoteSource {
    github;
    ref;
    files;
    truncated;
    lookup;
    cache = new Map();
    constructor(github, ref, files, truncated) {
        this.github = github;
        this.ref = ref;
        this.files = files;
        this.truncated = truncated;
        this.lookup = new Map(files.map((file) => [file.path, file]));
    }
    get repository() { return this.github.repo.fullName; }
    static async create(github, ref) {
        const resolved = ref ?? await github.defaultRef();
        const tree = await github.tree(resolved);
        return new RemoteSource(github, resolved, tree.files, tree.truncated);
    }
    async read(path, maxBytes) {
        const file = this.lookup.get(path);
        if (!file || file.size > maxBytes)
            return undefined;
        const key = `${path}:${maxBytes}`;
        if (!this.cache.has(key))
            this.cache.set(key, await this.github.blob(file, maxBytes));
        return this.cache.get(key);
    }
}
export class LocalSource {
    root;
    repository;
    files;
    truncated;
    ref;
    paths;
    constructor(root, repository, files, truncated) {
        this.root = root;
        this.repository = repository;
        this.files = files;
        this.truncated = truncated;
        this.paths = new Set(files.map((file) => file.path));
        // Local snapshots are not interchangeable with remote commit-pinned contexts.
        this.ref = `local:${createHash('sha256').update(JSON.stringify(files)).digest('hex')}`;
    }
    static async create(root, exclude = []) {
        const resolvedRoot = await realpath(root);
        const files = [];
        let visited = 0;
        let truncated = false;
        async function walk(directory, depth = 0) {
            if (depth > 30 || visited >= 30_000) {
                truncated = true;
                return;
            }
            const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
                if (++visited > 30_000 || files.length >= 20_000) {
                    truncated = true;
                    return;
                }
                const absolute = join(directory, entry.name);
                const path = relative(resolvedRoot, absolute).split(sep).join('/');
                if (entry.isSymbolicLink() || !includedPath(path, exclude))
                    continue;
                if (entry.isDirectory())
                    await walk(absolute, depth + 1);
                else if (entry.isFile()) {
                    const info = await lstat(absolute);
                    files.push({ path, size: info.size, sha: `local:${info.size}:${info.mtimeMs}` });
                }
            }
        }
        await walk(resolvedRoot);
        return new LocalSource(resolvedRoot, await inferRepository(resolvedRoot) ?? 'local', files, truncated);
    }
    async read(path, maxBytes) {
        if (!this.paths.has(path))
            return undefined;
        const target = join(this.root, path);
        // Check each ancestor on every read; a symlink directory must not escape the repository.
        let ancestor = this.root;
        for (const part of path.split('/').slice(0, -1)) {
            ancestor = join(ancestor, part);
            const stat = await lstat(ancestor);
            if (stat.isSymbolicLink() || !stat.isDirectory())
                throw new MaintainerError('UNSAFE', 'Repository directory changed into a symlink.');
        }
        const info = await lstat(target);
        if (info.size > maxBytes || !info.isFile() || info.isSymbolicLink())
            return undefined;
        const text = await readBounded(target, maxBytes);
        return text.includes('\0') ? undefined : text;
    }
}
/** No git process, hooks, credential helpers or repository programs are executed. */
export async function inferRepository(root) {
    try {
        const gitDir = await lstat(join(root, '.git'));
        if (!gitDir.isDirectory() || gitDir.isSymbolicLink())
            return undefined;
        const config = await optionalFile(join(root, '.git', 'config'), 100_000);
        const origin = config?.match(/\[remote\s+"origin"\]([^\[]*)/)?.[1]?.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
        return origin?.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/)?.[1];
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=source.js.map