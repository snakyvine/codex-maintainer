import { type Infer } from '../core/schema.js';
export interface RepoId {
    owner: string;
    name: string;
    fullName: string;
}
export declare function parseRepo(raw: string): RepoId;
export declare const issueSchema: import("../core/schema.js").Schema<{
    number: number;
    title: string;
    body: string | null;
    labels: (string | {
        name: string;
    })[];
    user: {
        login: string;
        type: string;
    } | null;
    updated_at: string;
    pull_request: {} | null;
}>;
export type Issue = Infer<typeof issueSchema>;
export declare const pullSchema: import("../core/schema.js").Schema<{
    number: number;
    title: string;
    body: string | null;
    changed_files: number;
    state: string;
    draft: boolean;
    updated_at: string;
    base: {
        sha: string;
        ref: string;
        repo: {
            full_name: string;
        };
    };
    head: {
        sha: string;
        ref: string;
        repo: {
            full_name: string;
        } | null;
    };
}>;
export type Pull = Infer<typeof pullSchema>;
export declare const changedFileSchema: import("../core/schema.js").Schema<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
    previous_filename: string;
}>;
export type ChangedFile = Infer<typeof changedFileSchema>;
export declare const commitSchema: import("../core/schema.js").Schema<{
    sha: string;
    commit: {
        message: string;
    };
    author: {
        login: string;
        type: string;
    } | null;
}>;
export type Commit = Infer<typeof commitSchema>;
export declare const associatedPullSchema: import("../core/schema.js").Schema<{
    number: number;
    title: string;
    body: string | null;
    merged_at: string | null;
    merge_commit_sha: string | null;
    user: {
        login: string;
        type: string;
    } | null;
    base: {
        repo: {
            full_name: string;
        };
    };
}>;
export type AssociatedPull = Infer<typeof associatedPullSchema>;
export declare const commentSchema: import("../core/schema.js").Schema<{
    id: number;
    body: string;
    user: {
        login: string;
        type: string;
    } | null;
}>;
export declare const releaseSchema: import("../core/schema.js").Schema<{
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    published_at: string | null;
}>;
export type Release = Infer<typeof releaseSchema>;
