import { s } from '../core/schema.js';
import { GitHubClient } from '../github/client.js';
import { parseRepo } from '../github/types.js';
import { Maintainer } from '../app.js';
import { readBounded, writeInside } from '../core/files.js';
import { MaintainerError } from '../core/errors.js';
export function fixtureProvider(responses) {
    return { async complete(task, schema) {
            return { value: schema.parse(responses[task]), provider: 'fixture', model: 'synthetic-fixture-not-live-ai', usage: null, requestId: null };
        } };
}
export function fixtureFetch(routes) {
    return async (input, init) => {
        if (init?.method && init.method !== 'GET')
            throw new MaintainerError('UNSAFE', 'The offline demo cannot perform writes.');
        const url = new URL(String(input));
        if (url.origin !== 'https://api.github.com')
            throw new MaintainerError('UNSAFE', 'Unexpected fixture origin.');
        const key = url.pathname + url.search;
        const data = routes[key] ?? routes[url.pathname];
        if (data === undefined)
            throw new MaintainerError('INVALID_DATA', `No offline fixture for ${url.pathname}.`);
        return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    };
}
export async function readFixture(path) {
    // The fixture is shipped project data, never selected by a live repository.
    let raw;
    try {
        raw = JSON.parse(await readBounded(path, 1_000_000));
    }
    catch {
        throw new MaintainerError('INVALID_DATA', 'Cannot load the shipped demo fixture JSON.');
    }
    s.object({ routes: s.object({}, false), responses: s.object({ triage: s.object({}, false), review: s.object({}, false), release: s.object({}, false) }, false) }, false).parse(raw);
    return raw;
}
export async function runDemo(fixturePath, directory) {
    const fixture = await readFixture(fixturePath);
    const github = new GitHubClient(parseRepo('demo/pagination'), 'offline-demo-token-not-valid', { fetch: fixtureFetch(fixture.routes) });
    const maintainer = new Maintainer(github, () => fixtureProvider(fixture.responses));
    const context = await maintainer.analyze();
    await writeInside(directory, 'context.json', `${JSON.stringify(context, null, 2)}\n`);
    const executions = [await maintainer.triage(123), await maintainer.review(456), await maintainer.release('v1.2.0', 'v1.1.0')];
    for (const execution of executions) {
        await writeInside(directory, `${execution.report.task}.md`, execution.markdown);
        await writeInside(directory, `${execution.report.task}.json`, `${JSON.stringify(execution.report, null, 2)}\n`);
    }
}
//# sourceMappingURL=index.js.map