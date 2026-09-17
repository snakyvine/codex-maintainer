import { type ChangedFile } from '../github/types.js';
import { type Config } from '../core/config.js';
import { includedPath, redact } from '../core/security.js';

export interface DiffLine { kind: 'context' | 'addition' | 'deletion'; oldLine: number | null; newLine: number | null; text: string }
export interface ParsedDiff { lines: DiffLine[]; valid: boolean; complete: boolean }
export interface PreparedFile { path: string; previousPath: string; status: string; lines: DiffLine[]; partial: boolean }
export interface ReviewCoverage {
  totalFiles: number; fetchedFiles: number; reviewedFiles: number; omittedFiles: number;
  partialFiles: number; unavailablePatches: number; excludedFiles: number; diffCharacters: number; apiTruncated: boolean;
}
export interface PreparedDiff { files: PreparedFile[]; coverage: ReviewCoverage; warnings: string[] }

/** Parse per-file unified patches, including zero-count hunks, renames and deleted files. */
export function parseDiff(patch: string): ParsedDiff {
  const lines: DiffLine[] = [];
  let old = 0, current = 0, oldRemaining = 0, newRemaining = 0;
  let active = false, valid = true, complete = true;
  for (const raw of patch.split('\n')) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(raw);
    if (header) {
      if (active && (oldRemaining !== 0 || newRemaining !== 0)) complete = false;
      old = Number(header[1]); current = Number(header[3]);
      oldRemaining = header[2] === undefined ? 1 : Number(header[2]);
      newRemaining = header[4] === undefined ? 1 : Number(header[4]);
      if (![old, current, oldRemaining, newRemaining].every(Number.isSafeInteger)) valid = false;
      active = true; continue;
    }
    if (!active) continue;
    if (raw.startsWith('\\ No newline at end of file')) continue;
    if (raw === '' && oldRemaining === 0 && newRemaining === 0) continue;
    if (raw.startsWith('+')) { lines.push({ kind: 'addition', oldLine: null, newLine: current++, text: raw.slice(1) }); newRemaining--; }
    else if (raw.startsWith('-')) { lines.push({ kind: 'deletion', oldLine: old++, newLine: null, text: raw.slice(1) }); oldRemaining--; }
    else if (raw.startsWith(' ')) { lines.push({ kind: 'context', oldLine: old++, newLine: current++, text: raw.slice(1) }); oldRemaining--; newRemaining--; }
    else { complete = false; if (raw !== '') valid = false; }
    if (oldRemaining < 0 || newRemaining < 0) valid = false;
  }
  if (oldRemaining !== 0 || newRemaining !== 0) complete = false;
  return { lines, valid: active && valid, complete };
}

function priority(file: ChangedFile): number {
  if (/auth|security|permission|crypto|session|payment|migrat/i.test(file.filename)) return 10;
  if (/\.(?:[cm]?js|[cm]?ts|tsx|jsx|py|go|rs|java|php|rb|c|cpp|cs)$/.test(file.filename)) return 5;
  return 0;
}

export function prepareDiff(changes: readonly ChangedFile[], totalFiles: number, apiTruncated: boolean, config: Config, secrets: readonly string[] = []): PreparedDiff {
  const files: PreparedFile[] = [];
  const warnings: string[] = [];
  let remaining = config.maxDiffChars;
  let unavailablePatches = 0, excludedFiles = 0;
  for (const file of [...changes].sort((a, b) => priority(b) - priority(a) || a.filename.localeCompare(b.filename))) {
    if (!includedPath(file.filename, config.excludePaths) || (file.previous_filename && !includedPath(file.previous_filename, config.excludePaths))) { excludedFiles++; continue; }
    if (!file.patch) { unavailablePatches++; continue; }
    const parsed = parseDiff(file.patch);
    if (!parsed.valid) { unavailablePatches++; continue; }
    if (files.length >= config.maxFiles || remaining < 100) continue;
    let inPrivateKey = false;
    const selected: DiffLine[] = [];
    // Index raw diff first, then redact text so redaction cannot move line numbers.
    for (const line of parsed.lines) {
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line.text)) inPrivateKey = true;
      const text = inPrivateKey ? '[REDACTED PRIVATE KEY]' : redact(line.text, secrets);
      if (/-----END [A-Z ]*PRIVATE KEY-----/.test(line.text)) inPrivateKey = false;
      const cost = text.length + 80; // Includes conservative JSON/line-location overhead.
      if (cost > remaining) break;
      selected.push({ ...line, text }); remaining -= cost;
    }
    if (!selected.some((line) => line.kind !== 'context')) continue;
    const additions = parsed.lines.filter((line) => line.kind === 'addition').length;
    const deletions = parsed.lines.filter((line) => line.kind === 'deletion').length;
    files.push({ path: file.filename, previousPath: file.previous_filename, status: file.status, lines: selected,
      partial: !parsed.complete || selected.length < parsed.lines.length || additions < file.additions || deletions < file.deletions });
  }
  const coverage: ReviewCoverage = { totalFiles, fetchedFiles: changes.length, reviewedFiles: files.length,
    omittedFiles: Math.max(0, totalFiles - files.length), partialFiles: files.filter((file) => file.partial).length,
    unavailablePatches, excludedFiles, diffCharacters: config.maxDiffChars - remaining, apiTruncated: apiTruncated || totalFiles > changes.length };
  if (coverage.omittedFiles) warnings.push(`${coverage.omittedFiles} changed files were not reviewed (API, exclusion, binary/patch or budget limits).`);
  if (coverage.partialFiles) warnings.push(`${coverage.partialFiles} reviewed files have partial diffs. Findings cover only the visible changed lines.`);
  if (coverage.unavailablePatches) warnings.push(`${coverage.unavailablePatches} files had no usable textual patch (binary, omitted or malformed).`);
  if (coverage.apiTruncated) warnings.push('GitHub file pagination did not cover every changed file.');
  return { files, coverage, warnings };
}
