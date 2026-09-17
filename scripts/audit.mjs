import { readFile, readdir, access, lstat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const errors = [], warnings = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...await walk(join(path, entry.name)));
    else result.push(join(path, entry.name));
  }
  return result;
}
const required = ['README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md', 'action.yml', 'package.json', 'tsconfig.json', '.gitignore', '.env.example', '.github/workflows/ci.yml', '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml', '.github/pull_request_template.md', 'docs/verification.md', 'docs/publishing.md', 'examples/demo-repository/fixtures.json'];
for (const path of required) check(await exists(path), `Missing required file: ${path}`);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tsconfig = JSON.parse(await readFile('tsconfig.json', 'utf8'));
check(tsconfig.compilerOptions.strict === true, 'TypeScript strict mode must be enabled.');
check(tsconfig.compilerOptions.noUncheckedIndexedAccess === true, 'Unchecked indexed access must be rejected.');
check(pkg.type === 'module' && pkg.engines.node === '>=22', 'Runtime module/engine contract changed.');
check(pkg.license === 'MIT', 'Package license must match LICENSE.');
for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) check(/^\d+\.\d+\.\d+$/.test(version), `Dependency is not exact-pinned: ${name}`);
for (const name of ['lint', 'typecheck', 'test', 'build', 'test:sdk', 'audit:repo', 'audit:release']) check(typeof pkg.scripts[name] === 'string', `Missing script: ${name}`);
for (const [name, command] of Object.entries(pkg.scripts)) {
  for (const match of command.matchAll(/node (scripts\/[^\s;&]+\.mjs)/g)) check(await exists(match[1]), `Script ${name} references missing ${match[1]}`);
  for (const match of command.matchAll(/npm run ([\w:-]+)/g)) check(Object.hasOwn(pkg.scripts, match[1]), `Script ${name} references missing npm script ${match[1]}`);
}
check(await exists(pkg.bin['codex-maintainer']), 'CLI compiled bin is missing.');
check((await readFile(pkg.bin['codex-maintainer'], 'utf8')).startsWith('#!/usr/bin/env node\n'), 'CLI executable shebang missing.');
check(await exists('dist/action/index.js'), 'Compiled Action entry point is missing.');
check((await readFile('src/version.ts', 'utf8')).includes(`'${pkg.version}'`), 'Source version differs from package version.');
const action = await readFile('action.yml', 'utf8');
check(/using: composite/.test(action), 'Action must match its composite build/runtime design.');
check(action.includes('node "$CM_ACTION_PATH/dist/action/index.js"'), 'Action does not invoke the actual compiled entry point.');
check(action.includes('working-directory: ${{ github.action_path }}'), 'Action installation directory must not be target checkout.');
check(action.includes('--ignore-scripts') && action.includes('--omit=dev'), 'Action installation must disable lifecycle scripts and omit dev dependencies.');
check(!/actions\/checkout|pull_request_target|write-all|contents:\s*write/.test(action), 'Unsafe Action checkout/permissions detected.');
const workflows = (await walk('.github/workflows')).filter((path) => /\.ya?ml$/.test(path));
for (const path of workflows) {
  const text = await readFile(path, 'utf8');
  check(!/write-all|contents:\s*write|pull_request_target/.test(text), `Broad permissions or privileged trigger in ${path}`);
  check(!text.includes('secrets.OPENAI_API_KEY'), `Project CI must not use live OpenAI keys: ${path}`);
}
for (const path of ['action.yml', ...workflows]) {
  const text = await readFile(path, 'utf8');
  for (const match of text.matchAll(/uses:\s*([^\s#]+)/g)) check(/@[a-f0-9]{40}$/.test(match[1]), `Dependency Action not pinned to full commit SHA: ${match[1]}`);
}
for (const path of await walk('src')) {
  if (!path.endsWith('.ts')) continue;
  check(!(await lstat(path)).isSymbolicLink(), `Source symlink not permitted: ${path}`);
  const text = await readFile(path, 'utf8');
  check(text.trim().length > 30, `Empty/nonimplementation source: ${path}`);
  check(!/\b(?:TODO|FIXME|TBD)\b|throw new Error\(['"]not implemented/i.test(text), `Unfinished implementation marker: ${path}`);
  if (text.includes('responses.create(')) check(path.replaceAll('\\', '/') === 'src/codex/openai.ts', `SDK call escaped provider boundary: ${path}`);
  check(!/\b(?:sk-[A-Za-z0-9_-]{24,}|github_pat_[A-Za-z0-9_]{24,}|ghp_[A-Za-z0-9]{24,})\b/.test(text), `Possible hardcoded credential: ${path}`);
}
for (const [name, path, key] of [
  ['triage', '../dist/triage/index.js', 'triageSchema'], ['review', '../dist/review/index.js', 'reviewSchema'],
  ['release', '../dist/release/index.js', 'releaseSchema'], ['context', '../dist/analysis/context.js', 'contextSchema'],
]) {
  const imported = await import(path);
  try { assert.deepEqual(JSON.parse(await readFile(`dist/schemas/${name}.json`, 'utf8')), imported[key].json); }
  catch { errors.push(`Generated ${name} JSON schema is stale or missing.`); }
}
const readme = await readFile('README.md', 'utf8');
for (const heading of ['What it does', 'Why', 'Quick Start', 'CLI Usage', 'GitHub Action', 'Examples', 'Configuration', 'Permissions', 'Security', 'How it works', 'Roadmap', 'Contributing', 'License']) check(readme.includes(`## ${heading}`), `README missing ${heading}`);
for (const name of ['triage', 'review', 'analyze', 'release', 'demo']) check(readme.includes(`codex-maintainer ${name}`), `README omits implemented CLI command ${name}`);
check(!/^\s*badge|img\.shields\.io.*(?:stars|downloads)|OpenAI endorsed|official OpenAI project\.$/im.test(readme), 'Unverified project status or adoption claim.');
// Relative documentation links must resolve in the actual source distribution.
for (const path of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', ...(await walk('docs')).filter((entry) => entry.endsWith('.md'))]) {
  const text = await readFile(path, 'utf8');
  for (const match of text.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    check(await exists(posix.join(posix.dirname(path.replaceAll('\\', '/')), target)), `Broken relative link in ${path}: ${target}`);
  }
}
check(!(await readFile('.gitignore', 'utf8')).split('\n').some((line) => /^\/?dist\/?$/.test(line)), 'Action dist must be tracked.');
check((await readFile('.env.example', 'utf8')).split('\n').every((line) => !line || line.startsWith('#') || /^[A-Z_]+=$/.test(line)), '.env.example must contain empty values only.');
const hasLock = await exists('package-lock.json');
if (!hasLock) warnings.push('No registry-generated lockfile: run npm install and complete release verification before tagging.');
if (process.argv.includes('--release')) {
  check(hasLock, 'Release requires a reviewed registry-generated package-lock.json.');
  if (hasLock) {
    const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
    check(lock.lockfileVersion >= 3 && lock.version === pkg.version, 'Release lockfile version/package version mismatch.');
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      const entry = lock.packages?.[`node_modules/${name}`];
      check(entry?.version === version && /^https:\/\/registry\.npmjs\.org\//.test(entry?.resolved ?? '') && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry?.integrity ?? ''), `Missing exact registry version/resolution/integrity for ${name}`);
    }
  }
}
for (const warning of warnings) process.stderr.write(`WARNING: ${warning}\n`);
if (errors.length) { process.stderr.write(`${errors.map((error) => `ERROR: ${error}`).join('\n')}\n`); process.exitCode = 1; }
else process.stdout.write(`Repository audit passed: required files, scripts, runtime/schema alignment, dependency pins, permissions, documentation links and implementation markers${process.argv.includes('--release') ? ', plus release lockfile records' : ''}.\n`);
