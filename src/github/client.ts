import { s, type Schema } from '../core/schema.js';
import { assert, MaintainerError } from '../core/errors.js';
import { isSafePath } from '../core/security.js';
import { GitHubHttp, type HttpOptions } from './http.js';
import { issueSchema, pullSchema, changedFileSchema, commitSchema, associatedPullSchema, releaseSchema, commentSchema, type RepoId, type Issue, type Pull, type ChangedFile, type Commit, type AssociatedPull, type Release } from './types.js';

export interface TreeFile { path: string; sha: string; size: number }
export interface Tree { files: TreeFile[]; truncated: boolean }
export interface PageSet<T> { items: T[]; truncated: boolean }
export interface Comparison { status: string; total: number; commits: Commit[]; truncated: boolean }
const shaSchema = s.object({ sha: s.string(64, 7) }, false);
const compareSchema = s.object({ status: s.enum(['ahead', 'behind', 'identical', 'diverged']), total_commits: s.number(), commits: s.array(commitSchema, 1_000) }, false);
const pathSegment = (value: string): string => encodeURIComponent(value);
function sha(value: string): string { assert(/^[a-f0-9]{7,64}$/i.test(value), 'GitHub returned an invalid commit or blob SHA.'); return value; }

export class GitHubClient {
  readonly http: GitHubHttp;
  private readonly root: string;
  constructor(readonly repo: RepoId, token: string, options: HttpOptions = {}) {
    this.http = new GitHubHttp(token, options);
    this.root = `/repos/${pathSegment(repo.owner)}/${pathSegment(repo.name)}`;
  }
  async paginate<T>(path: string, schema: Schema<T>, maxItems: number): Promise<PageSet<T>> {
    const items: T[] = [];
    const separator = path.includes('?') ? '&' : '?';
    // Full pages at the hard cap conservatively report truncation; no unbounded lookahead.
    for (let page = 1; ; page++) {
      const entries = await this.http.request(`${path}${separator}per_page=100&page=${page}`, s.array(schema, 100));
      const remaining = Math.max(0, maxItems - items.length);
      items.push(...entries.slice(0, remaining));
      if (entries.length > remaining) return { items, truncated: true };
      if (entries.length < 100) return { items, truncated: false };
      if (items.length >= maxItems) return { items, truncated: true };
    }
  }
  async defaultRef(): Promise<string> {
    const data = await this.http.request(this.root, s.object({ default_branch: s.string(500, 1) }, false));
    return this.resolveRef(data.default_branch);
  }
  async resolveRef(ref: string): Promise<string> {
    assert(ref.length > 0 && ref.length <= 500 && !/[\x00-\x1f]/.test(ref), 'Invalid Git ref.', 'CONFIG');
    return sha((await this.http.request(`${this.root}/commits/${pathSegment(ref)}`, shaSchema)).sha);
  }
  async tree(ref: string): Promise<Tree> {
    const data = await this.http.request(`${this.root}/git/trees/${pathSegment(sha(ref))}?recursive=1`, s.object({
      truncated: s.boolean(), tree: s.array(s.object({ path: s.string(1_000), type: s.string(20), mode: s.string(10), sha: s.string(64, 7), size: s.optional(s.number(), 0) }, false), 100_000),
    }, false));
    const safe = data.tree.filter((entry) => entry.type === 'blob' && ['100644', '100755'].includes(entry.mode) && isSafePath(entry.path));
    return { files: safe.slice(0, 20_000).map((entry) => ({ path: entry.path, sha: sha(entry.sha), size: entry.size })), truncated: data.truncated || safe.length > 20_000 };
  }
  async blob(file: TreeFile, maxBytes: number): Promise<string | undefined> {
    if (file.size > maxBytes) return undefined;
    const data = await this.http.request(`${this.root}/git/blobs/${pathSegment(sha(file.sha))}`, s.object({ encoding: s.string(30), content: s.string(2_000_000), size: s.number() }, false));
    if (data.encoding !== 'base64' || data.size > maxBytes) return undefined;
    const decoded = Buffer.from(data.content, 'base64');
    if (decoded.byteLength > maxBytes || decoded.includes(0)) return undefined;
    return decoded.toString('utf8');
  }
  async issue(number: number): Promise<Issue> {
    const issue = await this.http.request(`${this.root}/issues/${number}`, issueSchema);
    if (issue.pull_request !== null) throw new MaintainerError('CONFIG', 'This number is a pull request. Use review instead of triage.');
    return issue;
  }
  async pull(number: number): Promise<Pull> {
    const pull = await this.http.request(`${this.root}/pulls/${number}`, pullSchema);
    sha(pull.base.sha); sha(pull.head.sha);
    assert(pull.base.repo.full_name.toLowerCase() === this.repo.fullName.toLowerCase(), 'Pull request base repository mismatch.', 'UNSAFE');
    return pull;
  }
  async pullFiles(number: number, maxItems = 3_000): Promise<PageSet<ChangedFile>> {
    return this.paginate(`${this.root}/pulls/${number}/files`, changedFileSchema, Math.min(maxItems, 3_000));
  }
  async labels(): Promise<PageSet<string>> {
    const data = await this.paginate(`${this.root}/labels`, s.object({ name: s.string(100) }, false), 500);
    return { items: data.items.map((entry) => entry.name), truncated: data.truncated };
  }
  async releases(): Promise<PageSet<Release>> { return this.paginate(`${this.root}/releases`, releaseSchema, 300); }
  async compare(base: string, head: string, maxCommits: number): Promise<Comparison> {
    const commits: Commit[] = [];
    let total = 0;
    let status = '';
    const pageSize = Math.min(100, Math.max(1, maxCommits));
    for (let page = 1; ; page++) {
      const data = await this.http.request(`${this.root}/compare/${pathSegment(base)}...${pathSegment(head)}?per_page=${pageSize}&page=${page}`, compareSchema);
      if (page > 1 && (data.total_commits !== total || data.status !== status)) throw new MaintainerError('STALE', 'Comparison changed while paginating. Use immutable commit SHAs.');
      total = data.total_commits; status = data.status;
      commits.push(...data.commits.slice(0, Math.max(0, maxCommits - commits.length)));
      if (commits.length >= total || data.commits.length < pageSize || commits.length >= maxCommits) break;
    }
    return { status, total, commits, truncated: commits.length < total };
  }
  async associatedPulls(commitSha: string): Promise<PageSet<AssociatedPull>> {
    return this.paginate(`${this.root}/commits/${pathSegment(sha(commitSha))}/pulls`, associatedPullSchema, 100);
  }
  async currentUser(): Promise<string> {
    return (await this.http.request('/user', s.object({ login: s.string(100) }, false))).login;
  }
  async upsertComment(number: number, task: 'triage' | 'review', markdown: string, expectedAuthor: string): Promise<{ id: number; updated: boolean }> {
    const marker = `<!-- codex-maintainer:${task}:v1 -->`;
    const body = `${marker}\n${markdown}`;
    if (body.length > 60_000) throw new MaintainerError('LIMIT', 'Report exceeds the GitHub comment budget. Save it locally instead.');
    const comments = await this.paginate(`${this.root}/issues/${number}/comments`, commentSchema, 1_000);
    const existing = comments.items.filter((comment) => comment.user?.login === expectedAuthor && comment.body.startsWith(`${marker}\n`)).at(-1);
    if (!existing && comments.truncated) throw new MaintainerError('LIMIT', 'Comment history is too large to establish idempotency. No new comment was posted.');
    if (existing?.body === body) return { id: existing.id, updated: false };
    const response = existing
      ? await this.http.request(`${this.root}/issues/comments/${existing.id}`, commentSchema, 'PATCH', { body })
      : await this.http.request(`${this.root}/issues/${number}/comments`, commentSchema, 'POST', { body });
    return { id: response.id, updated: existing !== undefined };
  }
}
