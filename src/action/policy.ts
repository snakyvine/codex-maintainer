import { s } from '../core/schema.js';
import { MaintainerError } from '../core/errors.js';
import { parseRepo } from '../github/types.js';
export interface ActionDecision { task: 'triage' | 'review' | null; number: number | null; reason: string | null }
export interface ActionPolicy { allowForks: boolean; allowExternalIssues: boolean }
export function booleanInput(value: string | undefined, name: string): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new MaintainerError('CONFIG', `${name} must be exactly true or false.`);
}
export function decideAction(eventName: string, payload: unknown, repository: string, policy: ActionPolicy): ActionDecision {
  const expected = parseRepo(repository).fullName.toLowerCase();
  if (!['pull_request', 'issues'].includes(eventName)) throw new MaintainerError('UNSAFE', 'Only pull_request and issues events are supported. pull_request_target is intentionally rejected.');
  const envelope = s.object({ action: s.string(100), repository: s.object({ full_name: s.string(150) }, false) }, false).parse(payload);
  if (envelope.repository.full_name.toLowerCase() !== expected) throw new MaintainerError('UNSAFE', 'Event repository mismatch.');
  if (eventName === 'issues') {
    if (!['opened', 'reopened', 'edited'].includes(envelope.action)) return { task: null, number: null, reason: 'Issue event action does not request triage.' };
    const event = s.object({ issue: s.object({ number: s.number(1), author_association: s.string(100) }, false) }, false).parse(payload);
    if (!policy.allowExternalIssues && !['OWNER', 'MEMBER', 'COLLABORATOR'].includes(event.issue.author_association)) return { task: null, number: null, reason: 'External issue author skipped to prevent unbounded API spending. Enable allow-external-issues to opt in.' };
    return { task: 'triage', number: event.issue.number, reason: null };
  }
  if (!['opened', 'reopened', 'synchronize', 'ready_for_review', 'edited'].includes(envelope.action)) return { task: null, number: null, reason: 'PR event action does not request review.' };
  const event = s.object({ pull_request: s.object({ number: s.number(1), draft: s.optional(s.boolean(), false), base: s.object({ repo: s.object({ full_name: s.string(150) }, false) }, false), head: s.object({ repo: s.nullable(s.object({ full_name: s.string(150) }, false)) }, false) }, false) }, false).parse(payload);
  if (event.pull_request.base.repo.full_name.toLowerCase() !== expected) throw new MaintainerError('UNSAFE', 'PR base repository mismatch.');
  if (event.pull_request.draft) return { task: null, number: null, reason: 'Draft pull request skipped.' };
  const fork = event.pull_request.head.repo?.full_name.toLowerCase() !== expected;
  if (fork && !policy.allowForks) return { task: null, number: null, reason: 'Fork PR skipped. Run the CLI as a maintainer or explicitly opt in when credentials are safely available.' };
  return { task: 'review', number: event.pull_request.number, reason: null };
}
