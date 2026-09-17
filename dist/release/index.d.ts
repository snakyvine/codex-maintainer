import { type Infer } from '../core/schema.js';
import { type AIProvider } from '../codex/provider.js';
import { type GitHubClient } from '../github/client.js';
import { type Commit, type AssociatedPull } from '../github/types.js';
import { type Config } from '../core/config.js';
import { type Report } from '../core/report.js';
export interface ChangeRecord {
    id: string;
    title: string;
    body: string;
    kind: 'pr' | 'commit';
}
export interface ReleaseEvidence {
    repository: string;
    version: string;
    from: string;
    to: string;
    fromSha: string;
    toSha: string;
    changes: ChangeRecord[];
    contributors: string[];
    totalCommits: number;
    includedCommits: number;
    warnings: string[];
}
export declare const releaseSchema: import("../core/schema.js").Schema<{
    entries: {
        category: "dependencies" | "documentation" | "maintenance" | "breaking" | "features" | "fixes";
        description: string;
        sourceIds: string[];
    }[];
}>;
export type ReleaseResult = Infer<typeof releaseSchema>;
export interface ReleaseData extends ReleaseResult {
    evidence: ReleaseEvidence;
}
export declare function selectPreviousRelease(github: GitHubClient, toSha: string): Promise<string>;
export declare function buildChangeRecords(commits: readonly Commit[], pulls: readonly AssociatedPull[], associations: ReadonlyMap<string, number[]>): {
    changes: ChangeRecord[];
    contributors: string[];
};
export declare function collectReleaseEvidence(github: GitHubClient, version: string, config: Config, from?: string, to?: string): Promise<ReleaseEvidence>;
export declare function generateRelease(provider: AIProvider, evidence: ReleaseEvidence): Promise<Report<ReleaseData>>;
