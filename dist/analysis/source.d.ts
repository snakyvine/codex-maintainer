import { GitHubClient, type TreeFile } from '../github/client.js';
export interface RepositorySource {
    readonly repository: string;
    readonly ref: string;
    readonly files: readonly TreeFile[];
    readonly truncated: boolean;
    read(path: string, maxBytes: number): Promise<string | undefined>;
}
export declare class RemoteSource implements RepositorySource {
    private readonly github;
    readonly ref: string;
    readonly files: TreeFile[];
    readonly truncated: boolean;
    private readonly lookup;
    private readonly cache;
    private constructor();
    get repository(): string;
    static create(github: GitHubClient, ref?: string): Promise<RemoteSource>;
    read(path: string, maxBytes: number): Promise<string | undefined>;
}
export declare class LocalSource implements RepositorySource {
    private readonly root;
    readonly repository: string;
    readonly files: TreeFile[];
    readonly truncated: boolean;
    readonly ref: string;
    private readonly paths;
    private constructor();
    static create(root: string, exclude?: readonly string[]): Promise<LocalSource>;
    read(path: string, maxBytes: number): Promise<string | undefined>;
}
/** No git process, hooks, credential helpers or repository programs are executed. */
export declare function inferRepository(root: string): Promise<string | undefined>;
