import { type Schema } from '../core/schema.js';
import { GitHubHttp, type HttpOptions } from './http.js';
import { type RepoId, type Issue, type Pull, type ChangedFile, type Commit, type AssociatedPull, type Release } from './types.js';
export interface TreeFile {
    path: string;
    sha: string;
    size: number;
}
export interface Tree {
    files: TreeFile[];
    truncated: boolean;
}
export interface PageSet<T> {
    items: T[];
    truncated: boolean;
}
export interface Comparison {
    status: string;
    total: number;
    commits: Commit[];
    truncated: boolean;
}
export declare class GitHubClient {
    readonly repo: RepoId;
    readonly http: GitHubHttp;
    private readonly root;
    constructor(repo: RepoId, token: string, options?: HttpOptions);
    paginate<T>(path: string, schema: Schema<T>, maxItems: number): Promise<PageSet<T>>;
    defaultRef(): Promise<string>;
    resolveRef(ref: string): Promise<string>;
    tree(ref: string): Promise<Tree>;
    blob(file: TreeFile, maxBytes: number): Promise<string | undefined>;
    issue(number: number): Promise<Issue>;
    pull(number: number): Promise<Pull>;
    pullFiles(number: number, maxItems?: number): Promise<PageSet<ChangedFile>>;
    labels(): Promise<PageSet<string>>;
    releases(): Promise<PageSet<Release>>;
    compare(base: string, head: string, maxCommits: number): Promise<Comparison>;
    associatedPulls(commitSha: string): Promise<PageSet<AssociatedPull>>;
    currentUser(): Promise<string>;
    upsertComment(number: number, task: 'triage' | 'review', markdown: string, expectedAuthor: string): Promise<{
        id: number;
        updated: boolean;
    }>;
}
