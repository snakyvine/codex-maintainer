import { appendFile, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBounded, writeInside } from '../core/files.js';
import { decideAction, booleanInput } from './policy.js';
import { requireSecret, redact } from '../core/security.js';
import { MaintainerError, errorMessage } from '../core/errors.js';
import { parseRepo } from '../github/types.js';
import { GitHubClient } from '../github/client.js';
import { OpenAIProvider } from '../codex/openai.js';
import { Maintainer } from '../app.js';
import { createLogger } from '../core/logger.js';
async function output(env, key, value) {
    if (/[\r\n]/.test(value))
        throw new MaintainerError('UNSAFE', 'Multiline workflow output rejected.');
    const path = env['GITHUB_OUTPUT'];
    if (!path)
        throw new MaintainerError('CONFIG', 'GITHUB_OUTPUT is required.');
    await appendFile(path, `${key}=${value}\n`);
}
export async function runAction(env = process.env) {
    const eventPath = env['GITHUB_EVENT_PATH'];
    if (!eventPath)
        throw new MaintainerError('CONFIG', 'GITHUB_EVENT_PATH is required.');
    let payload;
    try {
        payload = JSON.parse(await readBounded(eventPath, 2_000_000));
    }
    catch (error) {
        if (error instanceof MaintainerError)
            throw error;
        throw new MaintainerError('CONFIG', 'Invalid GitHub event JSON.');
    }
    const decision = decideAction(env['GITHUB_EVENT_NAME'] ?? '', payload, env['GITHUB_REPOSITORY'] ?? '', {
        allowForks: booleanInput(env['CM_ACTION_ALLOW_FORKS'], 'allow-forks'), allowExternalIssues: booleanInput(env['CM_ACTION_ALLOW_EXTERNAL_ISSUES'], 'allow-external-issues'),
    });
    const logger = createLogger([env['OPENAI_API_KEY'] ?? '', env['GITHUB_TOKEN'] ?? '']);
    if (!decision.task || decision.number === null) {
        logger.info(decision.reason ?? 'Event skipped.');
        await output(env, 'status', 'skipped');
        return;
    }
    if (!env['OPENAI_API_KEY']?.trim() && (env['GITHUB_ACTOR'] === 'dependabot[bot]' || (env['CM_ACTION_ALLOW_FORKS'] === 'true' && env['GITHUB_EVENT_NAME'] === 'pull_request'))) {
        logger.warn('No OpenAI secret is available for this event. Fork/Dependabot secrets are not bypassed.');
        await output(env, 'status', 'skipped');
        return;
    }
    if (!env['GITHUB_OUTPUT'] || !env['RUNNER_TEMP'])
        throw new MaintainerError('CONFIG', 'GITHUB_OUTPUT and RUNNER_TEMP are required.');
    const token = requireSecret(env, 'GITHUB_TOKEN');
    const apiKey = requireSecret(env, 'OPENAI_API_KEY');
    const comment = booleanInput(env['CM_ACTION_COMMENT'], 'comment');
    const model = env['CM_ACTION_MODEL'] || env['CODEX_MAINTAINER_MODEL'];
    const github = new GitHubClient(parseRepo(env['GITHUB_REPOSITORY'] ?? ''), token, { logger });
    const maintainer = new Maintainer(github, (config) => new OpenAIProvider(config, apiKey, [token, apiKey], logger), { logger, secrets: [token, apiKey], ...(model ? { model } : {}) });
    const execution = decision.task === 'triage' ? await maintainer.triage(decision.number) : await maintainer.review(decision.number);
    const temp = env['RUNNER_TEMP'];
    if (!temp)
        throw new MaintainerError('CONFIG', 'RUNNER_TEMP is required.');
    const directory = await mkdtemp(join(temp, 'codex-maintainer-'));
    const markdownPath = await writeInside(directory, 'report.md', execution.markdown);
    const jsonPath = await writeInside(directory, 'report.json', `${JSON.stringify(execution.report, null, 2)}\n`);
    await output(env, 'report-path', markdownPath);
    await output(env, 'json-path', jsonPath);
    if (env['GITHUB_STEP_SUMMARY'])
        await appendFile(env['GITHUB_STEP_SUMMARY'], execution.markdown);
    if (comment) {
        const posted = await maintainer.comment(execution, 'github-actions[bot]');
        await output(env, 'comment-id', String(posted.id));
    }
    await output(env, 'status', 'completed');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    void runAction().catch((error) => { process.stderr.write(`${redact(errorMessage(error), [process.env['OPENAI_API_KEY'] ?? '', process.env['GITHUB_TOKEN'] ?? ''])}\n`); process.exitCode = 1; });
}
//# sourceMappingURL=index.js.map