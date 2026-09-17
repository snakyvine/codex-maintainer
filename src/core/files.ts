import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { MaintainerError } from './errors.js';
import { isSafePath } from './security.js';

export async function readBounded(path: string, limit = 1_000_000): Promise<string> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new MaintainerError('UNSAFE', 'Refusing symlink, non-file, or oversized local input.');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.size > limit) throw new MaintainerError('UNSAFE', 'Local input changed while reading.');
    const buffer = Buffer.alloc(limit + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > limit) throw new MaintainerError('LIMIT', 'Local input exceeds its byte budget.');
    return buffer.subarray(0, offset).toString('utf8');
  } finally { await handle.close(); }
}

export function missingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export async function optionalFile(path: string, limit?: number): Promise<string | undefined> {
  try { return await readBounded(path, limit); } catch (error) { if (missingFile(error)) return undefined; throw error; }
}

/** Local cache/demo writes never follow a repository-controlled symlink. */
export async function writeInside(root: string, relative: string, text: string): Promise<string> {
  if (!isSafePath(relative)) throw new MaintainerError('UNSAFE', 'Unsafe output path.');
  await mkdir(root, { recursive: true });
  const rootPath = await realpath(root);
  const target = resolve(rootPath, relative);
  if (!target.startsWith(`${rootPath}${sep}`)) throw new MaintainerError('UNSAFE', 'Output escapes the selected directory.');
  let current = rootPath;
  for (const part of relative.split('/').slice(0, -1)) {
    current = join(current, part);
    await mkdir(current).catch((error: unknown) => {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error;
    });
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new MaintainerError('UNSAFE', 'Output directory must not be a symlink.');
  }
  try { if ((await lstat(target)).isSymbolicLink()) throw new MaintainerError('UNSAFE', 'Output file must not be a symlink.'); } catch (error) { if (!missingFile(error)) throw error; }
  const temporary = join(dirname(target), `.cm-${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(text); await handle.close(); await rename(temporary, target); }
  catch (error) { await handle.close().catch(() => undefined); await unlink(temporary).catch(() => undefined); throw error; }
  return target;
}
