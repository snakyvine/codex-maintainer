import { s, type Infer } from '../core/schema.js';
import { type AIProvider } from '../codex/provider.js';
import { type GitHubClient } from '../github/client.js';
import { type Commit, type AssociatedPull } from '../github/types.js';
import { type Config } from '../core/config.js';
import { report, type Report } from '../core/report.js';
import { assert, MaintainerError } from '../core/errors.js';

export interface ChangeRecord { id: string; title: string; body: string; kind: 'pr' | 'commit' }
export interface ReleaseEvidence {
  repository: string; version: string; from: string; to: string; fromSha: string; toSha: string;
  changes: ChangeRecord[]; contributors: string[]; totalCommits: number; includedCommits: number; warnings: string[];
}
export const releaseSchema = s.object({ entries: s.array(s.object({ category: s.enum(['features', 'fixes', 'breaking', 'documentation', 'dependencies', 'maintenance']), description: s.string(1_000, 1), sourceIds: s.array(s.string(100, 1), 20) }), 250) });
export type ReleaseResult = Infer<typeof releaseSchema>;
export interface ReleaseData extends ReleaseResult { evidence: ReleaseEvidence }

export async function selectPreviousRelease(github: GitHubClient, toSha: string): Promise<string> {
  const releases = await github.releases();
  if (releases.truncated) throw new MaintainerError('LIMIT', 'Release history exceeds 300 entries. Choose an explicit --from tag.');
  const candidates = releases.items.filter((release) => !release.draft && !release.prerelease)
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  for (const candidate of candidates.slice(0, 30)) {
    const base = await github.resolveRef(candidate.tag_name);
    if (base === toSha) continue;
    const comparison = await github.compare(base, toSha, 1);
    if (comparison.status === 'ahead') return candidate.tag_name;
  }
  throw new MaintainerError('CONFIG', 'No preceding reachable stable release was found in the 30 most recent candidates. Supply --from <tag-or-sha>; this is required for a first release.');
}

export function buildChangeRecords(commits: readonly Commit[], pulls: readonly AssociatedPull[], associations: ReadonlyMap<string, number[]>): { changes: ChangeRecord[]; contributors: string[] } {
  const visibleShas = new Set(commits.map((commit) => commit.sha));
  const includedPulls = pulls.filter((pull) => pull.merged_at !== null && pull.merge_commit_sha !== null && visibleShas.has(pull.merge_commit_sha));
  const numbers = new Set(includedPulls.map((pull) => pull.number));
  const changes: ChangeRecord[] = includedPulls.map((pull) => ({ id: `pr:${pull.number}`, title: pull.title, body: (pull.body ?? '').slice(0, 1_500), kind: 'pr' }));
  for (const commit of commits) {
    if (associations.get(commit.sha)?.some((number) => numbers.has(number))) continue;
    changes.push({ id: `commit:${commit.sha}`, title: commit.commit.message.split('\n')[0] ?? '', body: commit.commit.message.slice(0, 1_000), kind: 'commit' });
  }
  const contributors = [...new Set([...commits.map((commit) => commit.author?.login), ...includedPulls.map((pull) => pull.user?.login)].filter((name): name is string => !!name))].sort();
  return { changes, contributors };
}

export async function collectReleaseEvidence(github: GitHubClient, version: string, config: Config, from?: string, to = version): Promise<ReleaseEvidence> {
  assert(version.length > 0 && version.length <= 100 && !/[\x00-\x1f]/.test(version), 'Invalid release version.', 'CONFIG');
  const toSha = await github.resolveRef(to);
  const fromRef = from ?? await selectPreviousRelease(github, toSha);
  const fromSha = await github.resolveRef(fromRef);
  const comparison = await github.compare(fromSha, toSha, config.maxCommits);
  assert(['ahead', 'identical'].includes(comparison.status), 'The release base is not an ancestor of the target. Choose an explicit ancestral --from ref.', 'CONFIG');
  if (!comparison.commits.length) throw new MaintainerError('CONFIG', 'The selected range contains no commits.');
  const warnings: string[] = [];
  if (comparison.truncated) warnings.push(`Commit range truncated: ${comparison.commits.length} of ${comparison.total} commits included. These are partial release notes.`);
  const pulls = new Map<number, AssociatedPull>();
  const associations = new Map<string, number[]>();
  for (const commit of comparison.commits) {
    const response = await github.associatedPulls(commit.sha);
    if (response.truncated) warnings.push('At least one commit had more PR associations than the lookup budget; some PR metadata may be missing.');
    const merged = response.items.filter((pull) => pull.merged_at !== null && pull.base.repo.full_name.toLowerCase() === github.repo.fullName.toLowerCase());
    associations.set(commit.sha, merged.map((pull) => pull.number));
    for (const pull of merged) pulls.set(pull.number, pull);
  }
  const records = buildChangeRecords(comparison.commits, [...pulls.values()], associations);
  return { repository: github.repo.fullName, version, from: fromRef, to, fromSha, toSha, ...records, totalCommits: comparison.total, includedCommits: comparison.commits.length, warnings: [...new Set(warnings)] };
}

export async function generateRelease(provider: AIProvider, evidence: ReleaseEvidence): Promise<Report<ReleaseData>> {
  const result = await provider.complete('release', releaseSchema, { version: evidence.version, changes: evidence.changes });
  result.value = releaseSchema.parse(result.value);
  const sources = new Set(evidence.changes.map((change) => change.id));
  const covered = new Set<string>();
  for (const entry of result.value.entries) {
    if (!entry.sourceIds.length || entry.sourceIds.some((id) => !sources.has(id))) throw new MaintainerError('MODEL_OUTPUT', 'Release entry cites unknown or missing source IDs. No notes were published.');
    entry.sourceIds = [...new Set(entry.sourceIds)];
    for (const id of entry.sourceIds) covered.add(id);
  }
  const missing = evidence.changes.filter((change) => !covered.has(change.id));
  const entries = [...result.value.entries, ...missing.map((change) => ({ category: 'maintenance' as const, description: change.title.slice(0, 1_000) || 'Untitled observed change', sourceIds: [change.id] }))];
  const warnings = [...evidence.warnings];
  if (missing.length) warnings.push(`${missing.length} observed changes were not categorized by the model and are retained under Maintenance.`);
  return report('release', evidence.repository, evidence.version, evidence.fromSha, { ...result, value: { entries, evidence } }, warnings, evidence.toSha);
}
