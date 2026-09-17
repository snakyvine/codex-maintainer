import test from 'node:test';
import assert from 'node:assert/strict';
import { app, fixture, repo, base, head, previous, code } from './helpers.js';
import { fixtureFetch, fixtureProvider } from '../src/demo/index.js';
import { Maintainer } from '../src/app.js';
import { GitHubClient } from '../src/github/client.js';
import { generateRelease, selectPreviousRelease, collectReleaseEvidence } from '../src/release/index.js';
import { parseConfig } from '../src/core/config.js';
import { reviewSchema } from '../src/review/index.js';
import { triageSchema } from '../src/triage/index.js';

test('full fixture workflows produce grounded triage, review, context and deduplicated release notes', async () => {
  const { maintainer } = await app();
  const context = await maintainer.analyze();
  assert.ok(context.files.includes('src/paginate.js')); assert.ok(context.languages.some((entry) => entry.name === 'JavaScript'));
  const triage = await maintainer.triage(123);
  assert.equal(triage.report.data.type, 'bug'); assert.ok(triage.report.data.labels.includes('bug'));
  assert.ok(triage.report.data.relatedFiles.some((entry) => entry.path === 'src/paginate.js'));
  const review = await maintainer.review(456);
  assert.equal(review.report.data.findings.length, 1); assert.equal(review.report.data.findings[0]?.line, 5);
  for (const title of ['Summary', 'Potential Bugs', 'Security Concerns', 'Breaking Changes', 'Test Coverage', 'Suggested Improvements']) assert.ok(review.markdown.includes(`## ${title}`));
  assert.equal(review.report.headRef, head); assert.equal(review.report.sourceRef, base);
  const release = await maintainer.release('v1.2.0', 'v1.1.0');
  assert.equal(release.report.data.evidence.includedCommits, 3);
  assert.equal(release.report.data.evidence.changes.length, 3);
  assert.deepEqual(release.report.data.evidence.changes.map((entry) => entry.id), ['pr:11', 'pr:12', `commit:${head}`]);
  assert.ok(release.markdown.includes('## Contributors')); assert.ok(!release.markdown.includes('undefined'));
  for (const execution of [triage, review, release]) { assert.equal(execution.report.provider, 'fixture'); assert.match(execution.markdown, /OFFLINE DEMO/); }
});
test('default release selection skips the current release and picks a reachable prior stable release', async () => {
  const { github } = await app();
  assert.equal(await selectPreviousRelease(github, head), 'v1.1.0');
  const { maintainer } = await app();
  const release = await maintainer.release('v1.2.0');
  assert.equal(release.report.data.evidence.from, 'v1.1.0');
});
test('release selection ignores newer releases not ancestral to target', async () => {
  const data = await fixture();
  data.routes['/repos/demo/pagination/releases'] = [
    { tag_name: 'unrelated', draft: false, prerelease: false, published_at: '2026-06-01T00:00:00Z' },
    { tag_name: 'draft', draft: true, prerelease: false, published_at: '2026-07-01T00:00:00Z' },
    { tag_name: 'v1.1.0', draft: false, prerelease: false, published_at: '2026-01-01T00:00:00Z' },
  ];
  data.routes['/repos/demo/pagination/commits/unrelated'] = { sha: 'f'.repeat(40) };
  data.routes[`/repos/demo/pagination/compare/${'f'.repeat(40)}...${head}`] = { status: 'diverged', total_commits: 0, commits: [] };
  const github = new GitHubClient(repo, 'token', { fetch: fixtureFetch(data.routes), retries: 0 });
  assert.equal(await selectPreviousRelease(github, head), 'v1.1.0');
});
test('release rejects non-ancestral and empty ranges instead of inventing history', async () => {
  for (const status of ['behind', 'diverged', 'identical']) {
    const data = await fixture();
    data.routes[`/repos/demo/pagination/compare/${previous}...${head}`] = { status, total_commits: 0, commits: [] };
    const github = new GitHubClient(repo, 'token', { fetch: fixtureFetch(data.routes), retries: 0 });
    await assert.rejects(collectReleaseEvidence(github, 'v1.2.0', parseConfig({}), 'v1.1.0'), code('CONFIG'));
  }
});
test('uncategorized commits survive model omission and unknown source IDs fail closed', async () => {
  const { data, github } = await app();
  const evidence = await collectReleaseEvidence(github, 'v1.2.0', parseConfig({}), 'v1.1.0');
  const empty = fixtureProvider({ ...data.responses, release: { entries: [] } });
  const retained = await generateRelease(empty, evidence);
  assert.equal(retained.data.entries.length, 3); assert.ok(retained.data.entries.every((entry) => entry.category === 'maintenance'));
  const invented = fixtureProvider({ ...data.responses, release: { entries: [{ category: 'fixes', description: 'made up', sourceIds: ['pr:999999'] }] } });
  await assert.rejects(generateRelease(invented, evidence), code('MODEL_OUTPUT'));
});
test('triage filters invented labels and unsupported file paths', async () => {
  const data = await fixture();
  const raw = triageSchema.parse(data.responses.triage);
  data.responses.triage = { ...raw, labels: [...raw.labels, 'model-created-label'], relatedFiles: [...raw.relatedFiles, { path: 'does-not-exist.ts', reason: 'model guess' }] };
  const github = new GitHubClient(repo, 'token', { fetch: fixtureFetch(data.routes), retries: 0 });
  const result = await new Maintainer(github, () => fixtureProvider(data.responses)).triage(123);
  assert.ok(!result.report.data.labels.includes('model-created-label'));
  assert.ok(!result.report.data.relatedFiles.some((entry) => entry.path === 'does-not-exist.ts'));
  assert.ok(result.report.warnings.length > 0);
});
test('ungrounded review findings are removed with explicit warnings', async () => {
  const data = await fixture();
  const result = reviewSchema.parse(data.responses.review);
  const first = result.findings[0]; assert.ok(first);
  data.responses.review = { ...result, findings: [first, { ...first, line: 999, title: 'Unsupported claim' }] };
  const github = new GitHubClient(repo, 'token', { fetch: fixtureFetch(data.routes), retries: 0 });
  const review = await new Maintainer(github, () => fixtureProvider(data.responses)).review(456);
  assert.equal(review.report.data.findings.length, 1);
  assert.ok(review.report.warnings.some((warning) => warning.includes('unsupported')));
});
test('PR changing while collecting files fails before model invocation', async () => {
  const data = await fixture(); const fetcher = fixtureFetch(data.routes); let pulls = 0, modelCalls = 0;
  const github = new GitHubClient(repo, 'token', { retries: 0, fetch: async (url, init) => {
    const response = await fetcher(url, init);
    if (new URL(String(url)).pathname.endsWith('/pulls/456') && ++pulls === 2) {
      const raw = await response.json() as { head: { sha: string } }; raw.head.sha = 'f'.repeat(40); return Response.json(raw);
    }
    return response;
  } });
  const maintainer = new Maintainer(github, () => { modelCalls++; return fixtureProvider(data.responses); });
  await assert.rejects(maintainer.review(456), code('STALE')); assert.equal(modelCalls, 0);
});
test('stale PR and edited issue cannot be posted, and fixture reports are always write-protected', async () => {
  const { data, github, maintainer } = await app();
  const review = await maintainer.review(456);
  await assert.rejects(maintainer.comment(review, 'bot'), code('UNSAFE'));
  // Simulates validated live provenance only to exercise freshness checks; no write transport exists here.
  review.report.provider = 'openai';
  const pull = data.routes['/repos/demo/pagination/pulls/456'] as { head: { sha: string } }; pull.head.sha = 'f'.repeat(40);
  await assert.rejects(maintainer.comment(review, 'bot'), code('STALE'));
  const issue = await maintainer.triage(123); issue.report.provider = 'openai';
  const raw = data.routes['/repos/demo/pagination/issues/123'] as { updated_at: string }; raw.updated_at = 'changed';
  await assert.rejects(maintainer.comment(issue, 'bot'), code('STALE'));
  assert.ok(github.http.requestCount > 0);
});
test('a valid explicit comment path publishes only to issue-comments API', async () => {
  const data = await fixture(); const read = fixtureFetch(data.routes); let writes = 0;
  data.routes['/repos/demo/pagination/issues/456/comments'] = [];
  const github = new GitHubClient(repo, 'token', { retries: 0, fetch: async (input, init) => {
    if (init?.method !== 'POST') return read(input, init);
    writes++; assert.equal(new URL(String(input)).pathname, '/repos/demo/pagination/issues/456/comments');
    const body = JSON.parse(String(init.body)) as { body: string }; assert.match(body.body, /^<!-- codex-maintainer:review:v1 -->/);
    return Response.json({ id: 8, body: body.body, user: { login: 'test-bot' } });
  } });
  const maintainer = new Maintainer(github, () => fixtureProvider(data.responses));
  const execution = await maintainer.review(456); assert.equal(writes, 0);
  execution.report.provider = 'openai';
  assert.equal((await maintainer.comment(execution, 'test-bot')).id, 8); assert.equal(writes, 1);
});

test('retained release evidence and fallback descriptions are sanitized in JSON as well as Markdown', async () => {
  const data = await fixture();
  const comparison = data.routes[`/repos/demo/pagination/compare/${previous}...${head}`] as { commits: { commit: { message: string } }[] };
  const last = comparison.commits.at(-1); assert.ok(last);
  last.commit.message = 'docs: exposed arbitrary-exact-secret-value';
  data.responses.release = { entries: [] };
  const github = new GitHubClient(repo, 'token', { fetch: fixtureFetch(data.routes), retries: 0 });
  const maintainer = new Maintainer(github, () => fixtureProvider(data.responses), { secrets: ['arbitrary-exact-secret-value'] });
  const result = await maintainer.release('v1.2.0', 'v1.1.0');
  assert.ok(!JSON.stringify(result.report).includes('arbitrary-exact-secret-value'));
  assert.ok(!result.markdown.includes('arbitrary-exact-secret-value'));
  assert.ok(JSON.stringify(result.report).includes('[REDACTED]'));
});
