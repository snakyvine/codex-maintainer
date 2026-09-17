import { type ChangedFile } from '../github/types.js';
import { type Config } from '../core/config.js';
export interface DiffLine {
    kind: 'context' | 'addition' | 'deletion';
    oldLine: number | null;
    newLine: number | null;
    text: string;
}
export interface ParsedDiff {
    lines: DiffLine[];
    valid: boolean;
    complete: boolean;
}
export interface PreparedFile {
    path: string;
    previousPath: string;
    status: string;
    lines: DiffLine[];
    partial: boolean;
}
export interface ReviewCoverage {
    totalFiles: number;
    fetchedFiles: number;
    reviewedFiles: number;
    omittedFiles: number;
    partialFiles: number;
    unavailablePatches: number;
    excludedFiles: number;
    diffCharacters: number;
    apiTruncated: boolean;
}
export interface PreparedDiff {
    files: PreparedFile[];
    coverage: ReviewCoverage;
    warnings: string[];
}
/** Parse per-file unified patches, including zero-count hunks, renames and deleted files. */
export declare function parseDiff(patch: string): ParsedDiff;
export declare function prepareDiff(changes: readonly ChangedFile[], totalFiles: number, apiTruncated: boolean, config: Config, secrets?: readonly string[]): PreparedDiff;
