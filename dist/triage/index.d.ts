import { type Infer } from '../core/schema.js';
import { type AIProvider } from '../codex/provider.js';
import { type Issue } from '../github/types.js';
import { type Evidence } from '../analysis/context.js';
import { type Report } from '../core/report.js';
export declare const issueTypes: readonly ["bug", "feature", "documentation", "question", "maintenance"];
export declare const triageSchema: import("../core/schema.js").Schema<{
    type: "bug" | "feature" | "documentation" | "question" | "maintenance";
    confidence: "high" | "low" | "medium";
    summary: string;
    relatedFiles: {
        path: string;
        reason: string;
    }[];
    investigation: string[];
    questions: string[];
    labels: string[];
    limitations: string[];
}>;
export type TriageResult = Infer<typeof triageSchema>;
export declare function triageIssue(provider: AIProvider, issue: Issue, evidence: Evidence, availableLabels: readonly string[]): Promise<Report<TriageResult>>;
