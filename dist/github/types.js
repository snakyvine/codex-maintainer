import { s } from '../core/schema.js';
import { MaintainerError } from '../core/errors.js';
export function parseRepo(raw) {
    const match = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/.exec(raw);
    if (!match?.[1] || !match[2] || match[2] === '.' || match[2] === '..')
        throw new MaintainerError('CONFIG', 'Repository must have the form owner/name (GitHub.com only).');
    return { owner: match[1], name: match[2], fullName: `${match[1]}/${match[2]}` };
}
const user = s.object({ login: s.string(100, 1), type: s.optional(s.string(30), 'User') }, false);
const label = s.union(s.string(100), s.object({ name: s.string(100) }, false));
export const issueSchema = s.object({
    number: s.number(1), title: s.string(10_000), body: s.nullable(s.string(200_000)),
    labels: s.array(label, 1_000), user: s.nullable(user), updated_at: s.string(100),
    pull_request: s.optional(s.nullable(s.object({}, false)), null),
}, false);
export const pullSchema = s.object({
    number: s.number(1), title: s.string(10_000), body: s.nullable(s.string(200_000)), changed_files: s.number(),
    state: s.string(20), draft: s.optional(s.boolean(), false), updated_at: s.string(100),
    base: s.object({ sha: s.string(64, 7), ref: s.string(500), repo: s.object({ full_name: s.string(150) }, false) }, false),
    head: s.object({ sha: s.string(64, 7), ref: s.string(500), repo: s.nullable(s.object({ full_name: s.string(150) }, false)) }, false),
}, false);
export const changedFileSchema = s.object({
    filename: s.string(1_000, 1), status: s.string(30), additions: s.number(), deletions: s.number(), changes: s.number(),
    patch: s.optional(s.string(8_000_000), ''), previous_filename: s.optional(s.string(1_000), ''),
}, false);
export const commitSchema = s.object({
    sha: s.string(64, 7), commit: s.object({ message: s.string(200_000) }, false), author: s.nullable(user),
}, false);
export const associatedPullSchema = s.object({
    number: s.number(1), title: s.string(10_000), body: s.nullable(s.string(200_000)),
    merged_at: s.nullable(s.string(100)), merge_commit_sha: s.nullable(s.string(64)),
    user: s.nullable(user), base: s.object({ repo: s.object({ full_name: s.string(150) }, false) }, false),
}, false);
export const commentSchema = s.object({ id: s.number(1), body: s.string(200_000), user: s.nullable(user) }, false);
export const releaseSchema = s.object({ tag_name: s.string(500, 1), draft: s.boolean(), prerelease: s.boolean(), published_at: s.nullable(s.string(100)) }, false);
//# sourceMappingURL=types.js.map