import { safeMarkdown as esc } from './security.js';
import { type Report } from './report.js';
import { type TriageResult } from '../triage/index.js';
import { type ReviewData, type Finding } from '../review/index.js';
import { type ReleaseData } from '../release/index.js';

function bullets(items: readonly string[]): string { return items.length ? items.map((item) => `- ${esc(item)}`).join('\n') : '_None suggested._'; }
function preamble<T>(report: Report<T>): string {
  return report.provider === 'fixture' ? '> OFFLINE DEMO - hand-authored synthetic fixture responses, not a live AI assessment.\n\n' : '> AI-generated maintainer recommendation. Human review required. No tests were executed.\n\n';
}
function footer<T>(report: Report<T>, limitations: readonly string[]): string {
  const notes = [...new Set([...report.warnings, ...limitations])];
  return `\n\n## Scope and limitations\n${bullets(notes)}\n\n---\nCodex Maintainer | ${esc(report.model)} | repository: ${esc(report.repository)} | context: ${esc(report.sourceRef)}${report.headRef ? ` | head: ${esc(report.headRef)}` : ''}\n`;
}
export function renderTriage(report: Report<TriageResult>): string {
  const data = report.data;
  return `${preamble(report)}# Issue #${report.target}: Triage\n\n**Type:** ${data.type} | **Confidence:** ${data.confidence}\n\n${esc(data.summary)}\n\n## Recommended labels\n${bullets(data.labels)}\n\n## Related files\n${data.relatedFiles.length ? data.relatedFiles.map((file) => `- **${esc(file.path)}** - ${esc(file.reason)}`).join('\n') : '_No evidence-backed files identified._'}\n\n## Investigation / reproduction suggestions\n${bullets(data.investigation)}\n\n## Questions for the reporter\n${bullets(data.questions)}${footer(report, data.limitations)}`;
}
function findings(items: readonly Finding[]): string {
  if (!items.length) return '_No evidence-backed findings in the reviewed scope. This is not an approval._';
  return items.map((finding) => `### ${finding.severity.toUpperCase()}: ${esc(finding.title)}\n**${esc(finding.path)}:${finding.line} (${finding.side})** | confidence: ${finding.confidence}\n\n${esc(finding.explanation)}\n\n> Evidence: ${esc(finding.quote)}\n\n**Recommendation:** ${esc(finding.recommendation)}`).join('\n\n');
}
export function renderReview(report: Report<ReviewData>): string {
  const data = report.data;
  const coverage = data.coverage;
  return `${preamble(report)}# PR #${report.target}: Review\n\n## Summary\n${esc(data.summary)}\n\n**Coverage:** ${coverage.reviewedFiles}/${coverage.totalFiles} changed files; ${coverage.partialFiles} partial diffs; ${coverage.omittedFiles} omitted files. Tests were not run.\n\n## Potential Bugs\n${findings(data.findings.filter((finding) => finding.category === 'bug'))}\n\n## Security Concerns\n${findings(data.findings.filter((finding) => finding.category === 'security'))}\n\n## Breaking Changes\n${findings(data.findings.filter((finding) => finding.category === 'breaking'))}\n\n## Test Coverage\n${esc(data.testCoverage.assessment)}\n\n${bullets(data.testCoverage.recommendations)}\n\n## Suggested Improvements\n${findings(data.findings.filter((finding) => finding.category === 'improvement'))}${footer(report, data.limitations)}`;
}
export function renderRelease(report: Report<ReleaseData>): string {
  const { evidence, entries } = report.data;
  const headings = { features: 'Features', fixes: 'Fixes', breaking: 'Breaking Changes', documentation: 'Documentation', dependencies: 'Dependencies', maintenance: 'Maintenance' } as const;
  const baseUrl = `https://github.com/${evidence.repository}`;
  const sections = Object.entries(headings).map(([category, heading]) => {
    const list = entries.filter((entry) => entry.category === category);
    const lines = list.map((entry) => {
      const links = entry.sourceIds.map((id) => id.startsWith('pr:') ? `[#${id.slice(3)}](${baseUrl}/pull/${id.slice(3)})` : `[${id.slice(7, 14)}](${baseUrl}/commit/${id.slice(7)})`).join(', ');
      return `- ${esc(entry.description)} (${links})`;
    });
    return `## ${heading}\n${lines.length ? lines.join('\n') : '_No observed changes in this category._'}`;
  });
  return `${preamble(report)}# ${esc(evidence.version)}\n\nRange: ${esc(evidence.from)} to ${esc(evidence.to)}. Included ${evidence.includedCommits}/${evidence.totalCommits} commits.\n\n${sections.join('\n\n')}\n\n## Contributors\n${bullets(evidence.contributors)}${footer(report, ['Release descriptions are model-generated summaries of the linked source records, not independently verified behavior.'])}`;
}
