import { s } from '../core/schema.js';
import { report } from '../core/report.js';
export const issueTypes = ['bug', 'feature', 'documentation', 'question', 'maintenance'];
export const triageSchema = s.object({
    type: s.enum(issueTypes), confidence: s.enum(['high', 'medium', 'low']), summary: s.string(2_000, 1),
    relatedFiles: s.array(s.object({ path: s.string(500, 1), reason: s.string(1_000, 1) }), 12),
    investigation: s.array(s.string(1_000, 1), 10), questions: s.array(s.string(1_000, 1), 8), labels: s.array(s.string(100, 1), 10),
    limitations: s.array(s.string(1_000, 1), 10),
});
export async function triageIssue(provider, issue, evidence, availableLabels) {
    const result = await provider.complete('triage', triageSchema, { issue: { number: issue.number, title: issue.title, body: (issue.body ?? '').slice(0, 30_000) }, ...evidence, availableLabels });
    // Providers are extension points, not trust boundaries: validate again regardless of implementation.
    result.value = triageSchema.parse(result.value);
    const paths = new Set(evidence.files.map((file) => file.path));
    const labels = availableLabels.length ? availableLabels : issueTypes;
    const warnings = [...evidence.limitations, ...evidence.context.limitations];
    if ((issue.body?.length ?? 0) > 30_000)
        warnings.push('Issue body was truncated to 30,000 characters.');
    const before = result.value.relatedFiles.length + result.value.labels.length;
    result.value.relatedFiles = result.value.relatedFiles.filter((file) => paths.has(file.path));
    result.value.labels = [...new Set(result.value.labels)].filter((label) => labels.includes(label));
    if (result.value.relatedFiles.length + result.value.labels.length < before)
        warnings.push('Unsupported model file references, duplicate labels or labels outside the allowlist were removed.');
    return report('triage', evidence.context.repository, String(issue.number), evidence.context.ref, result, warnings);
}
//# sourceMappingURL=index.js.map