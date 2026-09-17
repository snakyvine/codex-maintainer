import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { LocalSource } from '../src/analysis/source.js';
import { analyzeRepository, collectEvidence } from '../src/analysis/context.js';
import { parseConfig } from '../src/core/config.js';
import { readBounded, writeInside } from '../src/core/files.js';
import { runDemo } from '../src/demo/index.js';
import { fixturePath, code } from './helpers.js';
const temporary = async (): Promise<string> => mkdtemp(join(tmpdir(), 'cm-test-'));
const bin = resolve('dist/cli/index.js');
function cli(args: string[], cwd: string, entry = bin): ReturnType<typeof spawnSync> {
  const env = { ...process.env }; delete env['OPENAI_API_KEY']; delete env['GITHUB_TOKEN']; delete env['GITHUB_REPOSITORY']; delete env['CODEX_MAINTAINER_MODEL'];
  return spawnSync(process.execPath, [entry, ...args], { cwd, env, encoding: 'utf8', timeout: 10000 });
}
test('local analysis identifies languages, dependencies, test files and CI without running package scripts', async () => {
  const root = await temporary();
  try {
    await mkdir(join(root, 'src')); await mkdir(join(root, 'tests')); await mkdir(join(root, '.github/workflows'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { react: '1' }, scripts: { test: 'NEVER_EXECUTE_THIS' } }));
    await writeFile(join(root, 'src/index.ts'), 'export const answer = 42;'); await writeFile(join(root, 'tests/index.test.ts'), 'test case'); await writeFile(join(root, '.github/workflows/ci.yml'), 'name: CI');
    await writeFile(join(root, '.env'), 'secret=never-include');
    const source = await LocalSource.create(root);
    const context = await analyzeRepository(source, parseConfig({}));
    assert.ok(context.languages.some((entry) => entry.name === 'TypeScript'));
    assert.ok(context.frameworks.includes('react')); assert.ok(context.ci.includes('.github/workflows/ci.yml'));
    assert.ok(!context.files.includes('.env')); assert.ok(!JSON.stringify(context).includes('NEVER_EXECUTE_THIS'));
    const evidence = await collectEvidence(source, context, 'index', parseConfig({}));
    assert.ok(evidence.files.some((file) => file.path === 'src/index.ts'));
    assert.ok(evidence.files.every((file) => file.content.length <= 48000));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('context cache reuses a matching snapshot and invalidates when source changes', async () => {
  const root = await temporary();
  try {
    await writeFile(join(root, 'a.ts'), 'const a=1;');
    const config = parseConfig({}); const first = await analyzeRepository(await LocalSource.create(root), config);
    const cached = JSON.stringify({ ...first, generatedAt: 'preserved-time' });
    assert.equal((await analyzeRepository(await LocalSource.create(root), config, cached)).generatedAt, 'preserved-time');
    await writeFile(join(root, 'new.py'), 'print(1)');
    const changed = await analyzeRepository(await LocalSource.create(root), config, cached);
    assert.notEqual(changed.fingerprint, first.fingerprint); assert.ok(changed.files.includes('new.py'));
    assert.ok((await analyzeRepository(await LocalSource.create(root), config, '{broken')).files.length > 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('local reads and output writes do not follow repository-controlled symlinks', async () => {
  const root = await temporary(), outside = await temporary();
  try {
    await writeFile(join(outside, 'private.txt'), 'secret');
    await symlink(join(outside, 'private.txt'), join(root, 'link.txt'));
    await symlink(outside, join(root, '.codex-maintainer'), 'dir');
    const source = await LocalSource.create(root);
    assert.ok(!source.files.some((file) => file.path === 'link.txt'));
    await assert.rejects(readBounded(join(root, 'link.txt'), 100), code('UNSAFE'));
    await assert.rejects(writeInside(root, '.codex-maintainer/context.json', '{}'), code('UNSAFE'));
    await assert.rejects(writeInside(root, '../escape.txt', 'bad'), code('UNSAFE'));
    assert.equal(await readFile(join(outside, 'private.txt'), 'utf8'), 'secret');
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
test('offline demo writes complete real pipeline reports without network credentials', async () => {
  const root = await temporary();
  try {
    await runDemo(fixturePath, root);
    for (const name of ['triage', 'review', 'release']) {
      assert.match(await readFile(join(root, `${name}.md`), 'utf8'), /OFFLINE DEMO/);
      const report = JSON.parse(await readFile(join(root, `${name}.json`), 'utf8')) as { provider: string; schemaVersion: string };
      assert.equal(report.provider, 'fixture'); assert.equal(report.schemaVersion, '1');
    }
    assert.ok(await readFile(join(root, 'context.json'), 'utf8'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('compiled CLI help, subcommands and a symlink-style bin actually execute', async () => {
  const root = await temporary();
  try {
    for (const args of [['--help'], ['review', '--help'], ['release', '--help'], ['analyze', '--help'], ['triage', '--help'], ['demo', '--help']]) {
      const result = cli(args, root); assert.equal(result.status, 0, String(result.stderr)); assert.match(String(result.stdout), /Usage:/);
    }
    const alias = join(root, 'codex-maintainer'); await symlink(bin, alias);
    const linked = cli(['--version'], root, alias); assert.equal(linked.status, 0, String(linked.stderr)); assert.equal(String(linked.stdout).trim(), '1.0.0');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('CLI fails cleanly for missing credentials and malformed numbers before any API calls', async () => {
  const root = await temporary();
  try {
    const missing = cli(['--repo', 'demo/pagination', 'review', '456'], root);
    assert.equal(missing.status, 1); assert.match(String(missing.stderr), /GITHUB_TOKEN/);
    const bad = cli(['triage', 'bad'], root); assert.equal(bad.status, 1);
    const format = cli(['review', '456', '--format', 'html'], root); assert.equal(format.status, 1); assert.match(String(format.stderr), /format/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('README offline CLI commands analyze and demo produce their advertised files', async () => {
  const root = await temporary();
  try {
    const source = join(root, 'repository'); await mkdir(source); await writeFile(join(source, 'app.py'), 'print(1)');
    const analyze = cli(['analyze', '--root', source], root);
    assert.equal(analyze.status, 0, String(analyze.stderr)); assert.ok(await readFile(join(source, '.codex-maintainer/context.json'), 'utf8'));
    const demo = cli(['demo', '--output-dir', join(root, 'reports')], root);
    assert.equal(demo.status, 0, String(demo.stderr)); assert.match(await readFile(join(root, 'reports/review.md'), 'utf8'), /first page/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
