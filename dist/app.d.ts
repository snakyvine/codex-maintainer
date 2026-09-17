import { GitHubClient } from './github/client.js';
import { type RepositorySource } from './analysis/source.js';
import { type RepositoryContext } from './analysis/context.js';
import { type Config } from './core/config.js';
import { type AIProvider } from './codex/provider.js';
import { type TriageResult } from './triage/index.js';
import { type ReviewData } from './review/index.js';
import { type ReleaseData } from './release/index.js';
import { type Report } from './core/report.js';
import { type Logger } from './core/logger.js';
export interface Execution<T> {
    report: Report<T>;
    markdown: string;
    context: RepositoryContext | null;
    issueUpdatedAt: string | null;
}
export interface MaintainerOptions {
    model?: string;
    config?: unknown;
    cache?: string;
    secrets?: readonly string[];
    logger?: Logger;
}
export declare function sourceConfig(source: RepositorySource, options?: MaintainerOptions): Promise<Config>;
export declare class Maintainer {
    readonly github: GitHubClient;
    private readonly provider;
    private readonly options;
    private readonly logger;
    constructor(github: GitHubClient, provider: (config: Config) => AIProvider, options?: MaintainerOptions);
    analyze(): Promise<RepositoryContext>;
    triage(number: number): Promise<Execution<TriageResult>>;
    review(number: number): Promise<Execution<ReviewData>>;
    release(version: string, from?: string, to?: string): Promise<Execution<ReleaseData>>;
    comment(execution: Execution<unknown>, author: string): Promise<{
        id: number;
        updated: boolean;
    }>;
}
