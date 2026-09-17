import { RemoteSource } from './analysis/source.js';
import { analyzeRepository, collectEvidence } from './analysis/context.js';
import { parseConfig } from './core/config.js';
import { MaintainerError } from './core/errors.js';
import { triageIssue } from './triage/index.js';
import { reviewPull } from './review/index.js';
import { prepareDiff } from './review/diff.js';
import { collectReleaseEvidence, generateRelease } from './release/index.js';
import { renderTriage, renderReview, renderRelease } from './core/render.js';
import { silentLogger } from './core/logger.js';
import { redactData } from './core/security.js';
export async function sourceConfig(source, options = {}) {
    if (options.config !== undefined)
        return parseConfig(options.config, options.model);
    const text = await source.read('.codex-maintainer.json', 32_000);
    let raw = {};
    if (text) {
        try {
            raw = JSON.parse(text);
        }
        catch {
            throw new MaintainerError('CONFIG', 'The repository .codex-maintainer.json is not valid JSON.');
        }
    }
    return parseConfig(raw, options.model);
}
export class Maintainer {
    github;
    provider;
    options;
    logger;
    constructor(github, provider, options = {}) {
        this.github = github;
        this.provider = provider;
        this.options = options;
        this.logger = options.logger ?? silentLogger;
    }
    async analyze() {
        const source = await RemoteSource.create(this.github);
        const config = await sourceConfig(source, this.options);
        return redactData(await analyzeRepository(source, config, this.options.cache, this.logger), this.options.secrets);
    }
    async triage(number) {
        const issue = await this.github.issue(number);
        const source = await RemoteSource.create(this.github);
        const config = await sourceConfig(source, this.options);
        const context = await analyzeRepository(source, config, this.options.cache, this.logger);
        const evidence = await collectEvidence(source, context, `${issue.title}\n${issue.body ?? ''}`, config, [], this.options.secrets);
        const labels = await this.github.labels();
        const result = redactData(await triageIssue(this.provider(config), issue, evidence, labels.items), this.options.secrets);
        if (labels.truncated)
            result.warnings.push('The label allowlist was limited to the first 500 labels.');
        return { report: result, markdown: renderTriage(result), context, issueUpdatedAt: issue.updated_at };
    }
    async review(number) {
        const pull = await this.github.pull(number);
        const source = await RemoteSource.create(this.github, pull.base.sha);
        const config = await sourceConfig(source, this.options);
        const changes = await this.github.pullFiles(number);
        const current = await this.github.pull(number);
        if (current.head.sha !== pull.head.sha || current.base.sha !== pull.base.sha)
            throw new MaintainerError('STALE', 'The PR changed during collection. Retry to review a consistent snapshot.');
        const context = await analyzeRepository(source, config, this.options.cache, this.logger);
        const diff = prepareDiff(changes.items, pull.changed_files, changes.truncated && changes.items.length < pull.changed_files, config, this.options.secrets);
        const evidence = await collectEvidence(source, context, `${pull.title}\n${pull.body ?? ''}`, config, diff.files.map((file) => file.path), this.options.secrets);
        const result = redactData(await reviewPull(this.provider(config), pull, evidence, diff), this.options.secrets);
        return { report: result, markdown: renderReview(result), context, issueUpdatedAt: null };
    }
    async release(version, from, to) {
        const source = await RemoteSource.create(this.github);
        const config = await sourceConfig(source, this.options);
        const evidence = redactData(await collectReleaseEvidence(this.github, version, config, from, to), this.options.secrets);
        const result = redactData(await generateRelease(this.provider(config), evidence), this.options.secrets);
        return { report: result, markdown: renderRelease(result), context: null, issueUpdatedAt: null };
    }
    async comment(execution, author) {
        const { report } = execution;
        if (report.provider !== 'openai')
            throw new MaintainerError('UNSAFE', 'Fixture reports can never be posted to GitHub.');
        if (report.repository !== this.github.repo.fullName)
            throw new MaintainerError('UNSAFE', 'Report repository mismatch.');
        if (report.task === 'release')
            throw new MaintainerError('UNSAFE', 'Release only emits local notes; it does not publish GitHub releases.');
        const number = Number(report.target);
        if (!Number.isSafeInteger(number) || number <= 0)
            throw new MaintainerError('UNSAFE', 'Invalid comment target.');
        if (report.task === 'review') {
            const current = await this.github.pull(number);
            if (current.head.sha !== report.headRef || current.base.sha !== report.sourceRef || current.state !== 'open')
                throw new MaintainerError('STALE', 'The PR changed or closed after analysis. The stale report was not posted.');
        }
        else {
            const current = await this.github.issue(number);
            if (current.updated_at !== execution.issueUpdatedAt)
                throw new MaintainerError('STALE', 'The issue changed after analysis. The stale report was not posted.');
        }
        return this.github.upsertComment(number, report.task, execution.markdown, author);
    }
}
//# sourceMappingURL=app.js.map