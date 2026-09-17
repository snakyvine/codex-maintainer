import { type Report } from './report.js';
import { type TriageResult } from '../triage/index.js';
import { type ReviewData } from '../review/index.js';
import { type ReleaseData } from '../release/index.js';
export declare function renderTriage(report: Report<TriageResult>): string;
export declare function renderReview(report: Report<ReviewData>): string;
export declare function renderRelease(report: Report<ReleaseData>): string;
