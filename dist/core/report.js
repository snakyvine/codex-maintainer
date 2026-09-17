export function report(task, repository, target, sourceRef, result, warnings = [], headRef = null) {
    return { schemaVersion: '1', task, repository, target, sourceRef, headRef, generatedAt: new Date().toISOString(),
        provider: result.provider, model: result.model, usage: result.usage, requestId: result.requestId, warnings: [...new Set(warnings)], data: result.value };
}
//# sourceMappingURL=report.js.map