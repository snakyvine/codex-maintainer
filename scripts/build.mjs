import { spawnSync } from 'node:child_process';
import { rm, chmod, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versionSource = await readFile('src/version.ts', 'utf8');
if (!versionSource.includes(`'${pkg.version}'`)) throw new Error('package.json and src/version.ts versions differ.');
await rm('dist', { recursive: true, force: true });
const result = spawnSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
await chmod('dist/cli/index.js', 0o755);
await mkdir('dist/schemas', { recursive: true });
for (const [name, module, key] of [
  ['triage', '../dist/triage/index.js', 'triageSchema'],
  ['review', '../dist/review/index.js', 'reviewSchema'],
  ['release', '../dist/release/index.js', 'releaseSchema'],
  ['context', '../dist/analysis/context.js', 'contextSchema'],
]) {
  const imported = await import(module);
  await writeFile(`dist/schemas/${name}.json`, `${JSON.stringify(imported[key].json, null, 2)}\n`);
}
process.stdout.write(`Built Codex Maintainer ${pkg.version}; CLI, Action and JSON schemas are in dist/.\n`);
