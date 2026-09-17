import { s } from '../core/schema.js';
import { report } from '../core/report.js';
import { MaintainerError } from '../core/errors.js';
export const findingSchema = s.object({
    category: s.enum(['bug', 'security', 'breaking', 'improvement']), severity: s.enum(['critical', 'high', 'medium', 'low']),
    confidence: s.enum(['high', 'medium', 'low']), title: s.string(180, 1), explanation: s.string(2_000, 1), recommendation: s.string(1_000, 1),
    path: s.string(500, 1), side: s.enum(['LEFT', 'RIGHT']), line: s.number(1, 100_000_000), quote: s.string(500, 3),
});
export const reviewSchema = s.object({
    summary: s.string(2_000, 1), findings: s.array(findingSchema, 20),
    testCoverage: s.object({ assessment: s.string(2_000, 1), recommendations: s.array(s.string(1_000, 1), 10) }),
    limitations: s.array(s.string(1_000, 1), 15),
});
export function isGrounded(finding, diff) {
    if (finding.quote.trim().length < 3 || /[\r\n]/.test(finding.quote) || finding.quote.includes('[REDACTED'))
        return false;
    return diff.files.find((file) => file.path === finding.path)?.lines.some((line) => (finding.side === 'RIGHT' ? line.kind === 'addition' && line.newLine === finding.line : line.kind === 'deletion' && line.oldLine === finding.line)
        && line.text.includes(finding.quote)) ?? false;
}
export async function reviewPull(provider, pull, evidence, diff) {
    if (diff.files.length === 0)
        throw new MaintainerError('LIMIT', 'No reviewable changed lines remain after exclusions and budgets. No AI review or comment was generated.');
    const result = await provider.complete('review', reviewSchema, { pull: { number: pull.number, title: pull.title, body: (pull.body ?? '').slice(0, 25_000), base: pull.base.sha, head: pull.head.sha }, ...evidence, diff });
    result.value = reviewSchema.parse(result.value);
    const warnings = [...diff.warnings, ...evidence.limitations, ...evidence.context.limitations];
    if ((pull.body?.length ?? 0) > 25_000)
        warnings.push('PR description was truncated to 25,000 characters.');
    const findings = result.value.findings.filter((finding) => isGrounded(finding, diff));
    const removed = result.value.findings.length - findings.length;
    if (removed)
        warnings.push(`${removed} model findings with unsupported file, changed-line or quotation evidence were removed.`);
    const severity = { critical: 0, high: 1, medium: 2, low: 3 };
    const seen = new Set();
    const unique = findings.filter((finding) => {
        const key = `${finding.path}:${finding.side}:${finding.line}:${finding.title}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    }).sort((a, b) => severity[a.severity] - severity[b.severity] || a.path.localeCompare(b.path) || a.line - b.line);
    const value = { ...result.value, findings: unique, coverage: diff.coverage };
    return report('review', evidence.context.repository, String(pull.number), pull.base.sha, { ...result, value }, warnings, pull.head.sha);
}
//# sourceMappingURL=index.js.map