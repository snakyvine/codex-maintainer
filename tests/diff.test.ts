import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff, prepareDiff } from '../src/review/diff.js';
import { findingSchema, isGrounded } from '../src/review/index.js';
import { changedFileSchema } from '../src/github/types.js';
import { parseConfig } from '../src/core/config.js';
const change = (filename = 'src/auth.ts', patch = '@@ -1,2 +1,2 @@\n unchanged\n-old();\n+new();') => changedFileSchema.parse({ filename, status: 'modified', additions: 1, deletions: 1, changes: 2, patch });

test('unified diff maps both sides and changed/context lines correctly', () => {
  const parsed = parseDiff(change().patch);
  assert.equal(parsed.valid, true); assert.equal(parsed.complete, true);
  assert.deepEqual(parsed.lines, [
    { kind: 'context', oldLine: 1, newLine: 1, text: 'unchanged' },
    { kind: 'deletion', oldLine: 2, newLine: null, text: 'old();' },
    { kind: 'addition', oldLine: null, newLine: 2, text: 'new();' },
  ]);
});
test('new and deleted files, zero-count hunks and missing-newline markers parse', () => {
  const added = parseDiff('@@ -0,0 +1,2 @@\n+first\n+second\n\\ No newline at end of file');
  assert.equal(added.complete, true); assert.equal(added.lines[1]?.newLine, 2);
  const removed = parseDiff('@@ -1 +0,0 @@\n-removed');
  assert.equal(removed.valid, true); assert.equal(removed.complete, true); assert.equal(removed.lines[0]?.oldLine, 1);
});
test('multiple hunks retain original line numbers', () => {
  const parsed = parseDiff('@@ -1 +1 @@\n-old\n+new\n@@ -90,2 +90,2 @@ section\n context\n-bad\n+good');
  assert.equal(parsed.complete, true); assert.equal(parsed.lines.at(-1)?.newLine, 91);
});
test('malformed and truncated diffs do not become complete reviews', () => {
  assert.equal(parseDiff('not a patch').valid, false);
  assert.equal(parseDiff('@@ -1 +1 @@\n+one\n+two').valid, false);
  const partial = parseDiff('@@ -1,4 +1,4 @@\n-old\n+new');
  assert.equal(partial.valid, true); assert.equal(partial.complete, false);
  const result = prepareDiff([change('src/a.ts', '@@ -1,4 +1,4 @@\n-old\n+new')], 1, false, parseConfig({}));
  assert.equal(result.coverage.partialFiles, 1);
});
test('large PRs obey file and diff budgets and expose omitted coverage', () => {
  const changes = Array.from({ length: 400 }, (_, i) => change(`src/module-${i}.ts`));
  const result = prepareDiff(changes, 450, true, parseConfig({ maxFiles: 3, maxDiffChars: 1000 }));
  assert.ok(result.files.length <= 3); assert.ok(result.coverage.diffCharacters <= 1000);
  assert.equal(result.coverage.omittedFiles, 450 - result.files.length); assert.equal(result.coverage.apiTruncated, true);
  assert.ok(result.warnings.length > 0);
});
test('binary/unavailable patches, excluded and previously-secret paths are not reviewed', () => {
  const noPatch = changedFileSchema.parse({ filename: 'asset.bin', status: 'modified', additions: 0, deletions: 0, changes: 0 });
  const renamed = { ...change('src/new.ts'), previous_filename: '.env' };
  const result = prepareDiff([noPatch, change('.env'), renamed], 3, false, parseConfig({}));
  assert.equal(result.files.length, 0); assert.equal(result.coverage.omittedFiles, 3);
});
test('redaction does not shift diff coordinates or expose private-key middle lines', () => {
  const patch = '@@ -0,0 +1,5 @@\n+const token = "exact-secret-value";\n+-----BEGIN PRIVATE KEY-----\n+private-payload\n+-----END PRIVATE KEY-----\n+finish();';
  const file = { ...change('src/auth.ts', patch), additions: 5, deletions: 0 };
  const result = prepareDiff([file], 1, false, parseConfig({}), ['exact-secret-value']);
  assert.equal(result.files[0]?.lines[4]?.newLine, 5);
  assert.ok(!JSON.stringify(result).includes('private-payload')); assert.ok(!JSON.stringify(result).includes('exact-secret-value'));
});
test('findings require exact changed side, line, path and quote; context-only and invented locations fail', () => {
  const diff = prepareDiff([change()], 1, false, parseConfig({}));
  const finding = findingSchema.parse({ category: 'bug', severity: 'high', confidence: 'high', title: 'A problem', explanation: 'Why', recommendation: 'Fix', path: 'src/auth.ts', side: 'RIGHT', line: 2, quote: 'new();' });
  assert.equal(isGrounded(finding, diff), true);
  for (const bad of [{ ...finding, path: 'invented.ts' }, { ...finding, side: 'LEFT' as const }, { ...finding, line: 1, quote: 'unchanged' }, { ...finding, quote: 'invented' }, { ...finding, quote: 'new();\n' }]) assert.equal(isGrounded(bad, diff), false);
  assert.equal(isGrounded({ ...finding, side: 'LEFT', quote: 'old();' }, diff), true);
});
