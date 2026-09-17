import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decideAction, booleanInput } from '../src/action/policy.js';
import { runAction } from '../src/action/index.js';
import { code } from './helpers.js';
const policy = { allowForks: false, allowExternalIssues: false };
const pr = (fork = false, draft = false) => ({ action: 'opened', repository: { full_name: 'demo/pagination' }, pull_request: { number: 456, draft, base: { repo: { full_name: 'demo/pagination' } }, head: { repo: { full_name: fork ? 'outsider/pagination' : 'demo/pagination' } } } });

test('Action accepts eligible same-repository PRs and trusted issue authors', () => {
  assert.deepEqual(decideAction('pull_request', pr(), 'demo/pagination', policy), { task: 'review', number: 456, reason: null });
  for (const association of ['OWNER', 'MEMBER', 'COLLABORATOR']) assert.equal(decideAction('issues', { action: 'opened', repository: { full_name: 'demo/pagination' }, issue: { number: 123, author_association: association } }, 'demo/pagination', policy).task, 'triage');
});
test('Action skips forks, draft PRs, unsupported event actions and external issue authors by default', () => {
  assert.equal(decideAction('pull_request', pr(true), 'demo/pagination', policy).task, null);
  assert.equal(decideAction('pull_request', pr(false, true), 'demo/pagination', policy).task, null);
  assert.equal(decideAction('pull_request', { ...pr(), action: 'closed' }, 'demo/pagination', policy).task, null);
  const issue = { action: 'opened', repository: { full_name: 'demo/pagination' }, issue: { number: 123, author_association: 'NONE' } };
  assert.equal(decideAction('issues', issue, 'demo/pagination', policy).task, null);
  assert.equal(decideAction('issues', issue, 'demo/pagination', { ...policy, allowExternalIssues: true }).task, 'triage');
  assert.equal(decideAction('pull_request', pr(true), 'demo/pagination', { ...policy, allowForks: true }).task, 'review');
});
test('privileged pull_request_target and event/repository mismatches are rejected', () => {
  assert.throws(() => decideAction('pull_request_target', pr(), 'demo/pagination', policy), code('UNSAFE'));
  assert.throws(() => decideAction('workflow_run', pr(), 'demo/pagination', policy), code('UNSAFE'));
  assert.throws(() => decideAction('pull_request', pr(), 'different/repo', policy), code('UNSAFE'));
  const bad = pr(); bad.pull_request.base.repo.full_name = 'different/repo';
  assert.throws(() => decideAction('pull_request', bad, 'demo/pagination', policy), code('UNSAFE'));
});
test('boolean inputs are opt-in and do not accept ambiguous truthy strings', () => {
  assert.equal(booleanInput(undefined, 'comment'), false); assert.equal(booleanInput('false', 'comment'), false); assert.equal(booleanInput('true', 'comment'), true);
  for (const value of ['yes', 'TRUE', '1']) assert.throws(() => booleanInput(value, 'comment'), code('CONFIG'));
});
test('fork Action execution skips without credentials and emits a real workflow output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-action-'));
  try {
    const event = join(root, 'event.json'), output = join(root, 'outputs.txt'); await writeFile(event, JSON.stringify(pr(true)));
    await runAction({ GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: 'demo/pagination', GITHUB_OUTPUT: output });
    assert.equal(await readFile(output, 'utf8'), 'status=skipped\n');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('eligible Action without a required key fails instead of reporting success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cm-action-'));
  try {
    const event = join(root, 'event.json'); await writeFile(event, JSON.stringify(pr()));
    await assert.rejects(runAction({ GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: 'demo/pagination', GITHUB_TOKEN: 'test-token' }), code('CONFIG'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
