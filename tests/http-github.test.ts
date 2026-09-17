import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubHttp, retryDelay } from '../src/github/http.js';
import { GitHubClient } from '../src/github/client.js';
import { s } from '../src/core/schema.js';
import { fixtureFetch } from '../src/demo/index.js';
import { code, fixture, repo, base, head } from './helpers.js';
const object = s.object({ ok: s.boolean() });

test('fixed origin, version, authorization and redirect protection are applied', async () => {
  const http = new GitHubHttp('test-token', { fetch: async (url, init) => {
    assert.equal(String(url), 'https://api.github.com/test');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
    assert.equal(new Headers(init?.headers).get('x-github-api-version'), '2026-03-10');
    assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
    return Response.json({ ok: true });
  } });
  assert.deepEqual(await http.request('/test', object), { ok: true });
  await assert.rejects(http.request('//evil.example', object), code('UNSAFE'));
  await assert.rejects(http.request('https://evil.example', object), code('UNSAFE'));
});
test('transient read errors retry, bounded by attempts and request budget', async () => {
  let calls = 0; const waits: number[] = [];
  const http = new GitHubHttp('token', { fetch: async () => ++calls < 3 ? Response.json({}, { status: 503 }) : Response.json({ ok: true }), sleep: async (ms) => { waits.push(ms); } });
  assert.equal((await http.request('/test', object)).ok, true);
  assert.equal(calls, 3); assert.equal(waits.length, 2);
  const budget = new GitHubHttp('token', { maxRequests: 1, fetch: async () => { throw new Error('secret-do-not-log'); }, sleep: async () => undefined });
  await assert.rejects(budget.request('/test', object), code('LIMIT'));
});
test('network failure is redacted and writes are never retried', async () => {
  let calls = 0;
  const http = new GitHubHttp('token', { fetch: async () => { calls++; throw new Error('private upstream body'); } });
  await assert.rejects(http.request('/test', object, 'POST', { ok: true }), (error: unknown) => code('NETWORK')(error) && !String(error).includes('private upstream'));
  assert.equal(calls, 1);
});
test('short rate limits wait, long rate limits fail without retrying early', async () => {
  let calls = 0;
  const http = new GitHubHttp('token', { fetch: async () => ++calls === 1 ? Response.json({}, { status: 429, headers: { 'retry-after': '2' } }) : Response.json({ ok: true }), sleep: async (ms) => { assert.equal(ms, 2000); } });
  await http.request('/test', object); assert.equal(calls, 2);
  const long = new GitHubHttp('token', { fetch: async () => Response.json({}, { status: 403, headers: { 'retry-after': '90' } }), sleep: async () => { assert.fail('must not sleep and retry before retry-after'); } });
  await assert.rejects(long.request('/test', object), code('RATE_LIMIT'));
  assert.equal(long.requestCount, 1);
});
test('retry-after dates and primary-limit resets are honored', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  assert.equal(retryDelay(new Headers({ 'retry-after': 'Thu, 01 Jan 2026 00:00:05 GMT' }), 0, now), 5000);
  assert.equal(retryDelay(new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 10) }), 0, now), 11000);
});
test('authorization, malformed JSON, oversized responses and bad schemas fail cleanly', async () => {
  for (const [status, expected] of [[401, 'AUTH'], [403, 'AUTH'], [404, 'GITHUB']] as const) {
    const http = new GitHubHttp('token', { fetch: async () => Response.json({ secret: 'body' }, { status }), retries: 0 });
    await assert.rejects(http.request('/test', object), code(expected));
  }
  await assert.rejects(new GitHubHttp('token', { fetch: async () => new Response('{') }).request('/test', object), code('GITHUB'));
  await assert.rejects(new GitHubHttp('token', { fetch: async () => new Response('{}', { headers: { 'content-length': '9000000' } }) }).request('/test', object), code('LIMIT'));
  await assert.rejects(new GitHubHttp('token', { fetch: async () => Response.json({ ok: 'yes' }) }).request('/test', object), code('INVALID_DATA'));
});
test('pagination fetches subsequent pages and explicitly reports hard caps', async () => {
  const github = new GitHubClient(repo, 'token', { fetch: async (input) => {
    const page = new URL(String(input)).searchParams.get('page');
    return Response.json(page === '1' ? Array.from({ length: 100 }, (_, i) => i) : [100, 101]);
  } });
  const all = await github.paginate('/test', s.number(), 200);
  assert.equal(all.items.length, 102); assert.equal(all.truncated, false);
  const capped = await github.paginate('/test', s.number(), 50);
  assert.equal(capped.items.length, 50); assert.equal(capped.truncated, true);
});
test('commit comparison paginates above 100 and detects changing ranges', async () => {
  const commit = (i: number) => ({ sha: i.toString(16).padStart(40, '0'), commit: { message: `commit ${i}` }, author: null });
  const github = new GitHubClient(repo, 'token', { fetch: async (input) => {
    const page = Number(new URL(String(input)).searchParams.get('page'));
    return Response.json({ status: 'ahead', total_commits: 150, commits: Array.from({ length: page === 1 ? 100 : 50 }, (_, i) => commit(i + (page - 1) * 100)) });
  } });
  assert.equal((await github.compare(base, head, 200)).commits.length, 150);
  assert.equal((await github.compare(base, head, 110)).truncated, true);
  const changing = new GitHubClient(repo, 'token', { fetch: async (input) => {
    const page = Number(new URL(String(input)).searchParams.get('page'));
    return Response.json({ status: 'ahead', total_commits: page === 1 ? 150 : 151, commits: Array.from({ length: 100 }, (_, i) => commit(i)) });
  } });
  await assert.rejects(changing.compare(base, head, 200), code('STALE'));
});
test('tree excludes symlinks, submodules and unsafe paths; oversize blobs avoid reads', async () => {
  let calls = 0;
  const github = new GitHubClient(repo, 'token', { fetch: async () => { calls++; return Response.json({ truncated: true, tree: [
    { path: 'src/a.ts', sha: base, size: 10, type: 'blob', mode: '100644' },
    { path: 'link', sha: base, size: 10, type: 'blob', mode: '120000' },
    { path: '../secret', sha: base, size: 10, type: 'blob', mode: '100644' },
    { path: 'module', sha: base, type: 'commit', mode: '160000' },
  ] }); } });
  assert.deepEqual((await github.tree(base)).files.map((file) => file.path), ['src/a.ts']);
  assert.equal(await github.blob({ path: 'large', sha: base, size: 200 }, 100), undefined);
  assert.equal(calls, 1);
});
test('issue numbers that actually identify PRs are rejected', async () => {
  const data = await fixture();
  const original = data.routes['/repos/demo/pagination/issues/123'] as Record<string, unknown>;
  data.routes['/repos/demo/pagination/issues/123'] = { ...original, pull_request: { url: 'https://api.github.com/pulls/123' } };
  const github = new GitHubClient(repo, 'token', { fetch: fixtureFetch(data.routes) });
  await assert.rejects(github.issue(123), code('CONFIG'));
});
test('comment upsert only edits its own marker, deduplicates identical bodies and never writes by inference', async () => {
  const body = '<!-- codex-maintainer:review:v1 -->\nReport';
  const comments = [
    { id: 1, body, user: { login: 'someone-else' } },
    { id: 2, body, user: { login: 'github-actions[bot]' } },
  ];
  const writes: { method: string; path: string; body: unknown }[] = [];
  const github = new GitHubClient(repo, 'token', { fetch: async (input, init) => {
    if (init?.method === 'GET') return Response.json(comments);
    writes.push({ method: init?.method ?? '', path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) as unknown });
    return Response.json({ id: 2, body: 'Changed', user: { login: 'github-actions[bot]' } });
  } });
  assert.equal((await github.upsertComment(456, 'review', 'Report', 'github-actions[bot]')).id, 2);
  assert.equal(writes.length, 0);
  await github.upsertComment(456, 'review', 'Changed', 'github-actions[bot]');
  assert.equal(writes[0]?.method, 'PATCH'); assert.match(writes[0]?.path ?? '', /comments\/2$/);
});

test('interrupted HTTP body retries reads and does not leak transport details', async () => {
  let calls = 0;
  const http = new GitHubHttp('token', { sleep: async () => undefined, fetch: async () => {
    if (++calls === 1) return new Response(new ReadableStream({ start(controller) { controller.error(new Error('sensitive transport message')); } }));
    return Response.json({ ok: true });
  } });
  assert.equal((await http.request('/test', object)).ok, true); assert.equal(calls, 2);
});
