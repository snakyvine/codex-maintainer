import test from 'node:test';
import assert from 'node:assert/strict';
import { s, parseJson } from '../src/core/schema.js';
import { parseConfig } from '../src/core/config.js';
import { isSafePath, includedPath, positiveInteger, requireSecret, redact, safeMarkdown, redactSource } from '../src/core/security.js';
import { parseRepo, issueSchema, pullSchema } from '../src/github/types.js';
import { reviewSchema } from '../src/review/index.js';
import { code, fixture, base } from './helpers.js';

test('strict schemas reject missing fields, unknown keys, wrong types, long strings and NaN', () => {
  const schema = s.object({ text: s.string(4, 1), count: s.number(0, 3), enabled: s.boolean() });
  assert.deepEqual(schema.parse({ text: 'ok', count: 1, enabled: false }), { text: 'ok', count: 1, enabled: false });
  for (const bad of [{}, { text: 'ok', count: 1, enabled: false, extra: true }, { text: '', count: 1, enabled: false }, { text: 'longer', count: 1, enabled: false }, { text: 'ok', count: NaN, enabled: false }, { text: 'ok', count: 1.1, enabled: false }, null, []]) assert.throws(() => schema.parse(bad), code('INVALID_DATA'));
});
test('defaults are isolated and permissive API parsing strips unknown fields', () => {
  const schema = s.object({ items: s.optional(s.array(s.string()), []) }, false);
  const a = schema.parse({ extra: true }); a.items.push('mutation');
  assert.deepEqual(schema.parse({}), { items: [] });
});
test('inherited properties and prototype pollution are not accepted', () => {
  assert.throws(() => s.object({ title: s.string() }).parse(Object.create({ title: 'inherited' })), code('INVALID_DATA'));
  assert.throws(() => s.object({}).parse(JSON.parse('{"__proto__":{"polluted":true}}') as unknown), code('INVALID_DATA'));
  assert.equal(Object.getOwnPropertyDescriptor({}, 'polluted'), undefined);
});
test('enum, union, nullable, array limits and invalid model JSON fail closed', () => {
  const schema = s.object({ category: s.enum(['bug', 'feature']), value: s.nullable(s.union(s.string(), s.number())), items: s.array(s.boolean(), 1) });
  assert.equal(schema.parse({ category: 'bug', value: null, items: [] }).value, null);
  for (const text of ['```json\n{}\n```', '{}', '{', '{"category":"other","value":1,"items":[]}']) assert.throws(() => parseJson(text, schema, true), code('MODEL_OUTPUT'));
  assert.throws(() => schema.parse({ category: 'bug', value: 's', items: [true, false] }), code('INVALID_DATA'));
});
test('every nested AI output object has all properties required and denies unknown keys', () => {
  const walk = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return;
    const record = value as Record<string, unknown>;
    if (record['type'] === 'object') {
      assert.equal(record['additionalProperties'], false);
      assert.deepEqual([...(record['required'] as string[])].sort(), Object.keys(record['properties'] as object).sort());
    }
    for (const child of Object.values(record)) { if (Array.isArray(child)) child.forEach(walk); else walk(child); }
  };
  walk(reviewSchema.json);
});
test('configuration is bounded, strict, immutable across calls and refuses path globs', () => {
  assert.equal(parseConfig({}).model, 'gpt-5.3-codex');
  assert.equal(parseConfig({ model: 'old' }, 'custom.model').model, 'custom.model');
  for (const value of [{ typo: 1 }, { maxFiles: 0 }, { maxDiffChars: 999999 }, { excludePaths: ['../outside'] }, { excludePaths: ['src/**'] }, { model: 'bad\nmodel' }]) assert.throws(() => parseConfig(value));
  assert.deepEqual(parseConfig({ excludePaths: ['private/'] }).excludePaths, ['private/']);
});
test('paths reject traversal, symlinks-by-policy names, controls, keys and generated content', () => {
  for (const path of ['/etc/passwd', '../secret', 'a/../b', 'a\\b', 'x\u202Ets', 'x\x00y']) assert.equal(isSafePath(path), false, path);
  for (const path of ['.env', '.env.production', 'config/private.pem', 'node_modules/code.js', '.git/config', 'secrets.json', 'package-lock.json']) assert.equal(includedPath(path, []), false, path);
  assert.equal(includedPath('src/auth.ts', []), true);
  assert.equal(includedPath('private/auth.ts', ['private/']), false);
  assert.equal(includedPath('privateish/auth.ts', ['private/']), true);
});
test('environment and identifiers reject missing, malformed and hostile values', () => {
  assert.throws(() => requireSecret({}, 'OPENAI_API_KEY'), code('CONFIG'));
  assert.throws(() => requireSecret({ GITHUB_TOKEN: 'bad\nheader' }, 'GITHUB_TOKEN'), code('CONFIG'));
  assert.equal(positiveInteger('123'), 123);
  for (const raw of ['0', '-1', '1.0', 'NaN', '1;echo', '999999999999']) assert.throws(() => positiveInteger(raw));
  assert.equal(parseRepo('owner/repo.name').fullName, 'owner/repo.name');
  for (const raw of ['https://github.com/o/r', 'a/../b', 'a/b/c', 'a\\b', 'a/b\n']) assert.throws(() => parseRepo(raw));
});
test('redaction removes exact keys, credential URLs and private key blocks', () => {
  const exact = 'unique-test-secret-123';
  const text = `${exact}\nhttps://name:password@example.com/path\n-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n`;
  const clean = redact(text, [exact]);
  assert.ok(!clean.includes(exact)); assert.ok(!clean.includes('name:password')); assert.ok(!clean.includes('abc123'));
  assert.match(clean, /REDACTED/);
});
test('Markdown output neutralizes HTML, links, image beacons, mentions and controls', () => {
  const text = safeMarkdown('<script>alert(1)</script> ![x](https://evil.example) @everyone \x1b[31m');
  assert.ok(!text.includes('<script>')); assert.ok(!text.includes('![x](')); assert.ok(!text.includes('@everyone')); assert.ok(!text.includes('\x1b'));
});
test('GitHub issue/PR parsing accepts documented nullable bodies and label shapes', async () => {
  const data = await fixture();
  const issue = issueSchema.parse(data.routes['/repos/demo/pagination/issues/123']);
  assert.equal(issue.number, 123);
  assert.equal(issueSchema.parse({ ...issue, body: null, labels: ['bug', { name: 'help' }] }).labels.length, 2);
  assert.equal(pullSchema.parse(data.routes['/repos/demo/pagination/pulls/456']).base.sha, base);
  assert.throws(() => issueSchema.parse({ ...issue, number: '123' }), code('INVALID_DATA'));
  assert.throws(() => pullSchema.parse({ base: {} }), code('INVALID_DATA'));
});

test('source redaction preserves lines around multi-line private keys', () => {
  const text = 'before\n-----BEGIN PRIVATE KEY-----\npayload\n-----END PRIVATE KEY-----\nafter';
  const safe = redactSource(text);
  assert.equal(safe.split('\n').length, text.split('\n').length);
  assert.equal(safe.split('\n')[4], 'after'); assert.ok(!safe.includes('payload'));
});
