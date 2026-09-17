import { type Infer } from '../core/schema.js';
import { type AIProvider } from '../codex/provider.js';
import { type Pull } from '../github/types.js';
import { type Evidence } from '../analysis/context.js';
import { type Report } from '../core/report.js';
import { type PreparedDiff, type ReviewCoverage } from './diff.js';
export declare const findingSchema: import("../core/schema.js").Schema<{
    category: "bug" | "security" | "breaking" | "improvement";
    severity: "high" | "low" | "medium" | "critical";
    confidence: "high" | "low" | "medium";
    title: string;
    explanation: string;
    recommendation: string;
    path: string;
    side: "LEFT" | "RIGHT";
    line: number;
    quote: string;
}>;
export declare const reviewSchema: import("../core/schema.js").Schema<{
    summary: string;
    findings: {
        category: "bug" | "security" | "breaking" | "improvement";
        severity: "high" | "low" | "medium" | "critical";
        confidence: "high" | "low" | "medium";
        title: string;
        explanation: string;
        recommendation: string;
        path: string;
        side: "LEFT" | "RIGHT";
        line: number;
        quote: string;
    }[];
    testCoverage: {
        assessment: string;
        recommendations: string[];
    };
    limitations: string[];
}>;
export type ReviewResult = Infer<typeof reviewSchema>;
export type Finding = Infer<typeof findingSchema>;
export interface ReviewData extends ReviewResult {
    coverage: ReviewCoverage;
}
export declare function isGrounded(finding: Finding, diff: PreparedDiff): boolean;
export declare function reviewPull(provider: AIProvider, pull: Pull, evidence: Evidence, diff: PreparedDiff): Promise<Report<ReviewData>>;
