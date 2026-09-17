/** Uses the REAL installed OpenAI SDK with an in-memory HTTP transport. No API key or network needed. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { OpenAIProvider } from '../dist/codex/openai.js';
import { parseConfig } from '../dist/core/config.js';
import { s } from '../dist/core/schema.js';
let OpenAI;
try { ({ default: OpenAI } = await import('openai')); }
catch { process.stderr.write('SDK contract NOT RUN: the official openai dependency must be installed first.\n'); process.exit(1); }
const require = createRequire(import.meta.url);
const required = require('openai');
assert.equal(typeof (typeof required === 'function' ? required : required.default), 'function', 'CJS constructor used by adapter');
let requests = 0;
const client = new OpenAI({
  apiKey: 'sdk-contract-test-not-a-real-key', baseURL: 'https://api.openai.com/v1', maxRetries: 0, timeout: 1000, logLevel: 'off',
  fetch: async (input, init) => {
    requests++;
    const request = new Request(input, init);
    assert.equal(request.url, 'https://api.openai.com/v1/responses');
    assert.equal(request.method, 'POST');
    const body = await request.json();
    assert.equal(body.store, false);
    assert.equal(body.model, 'gpt-5.3-codex');
    assert.equal(body.tools, undefined);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    return Response.json({
      id: 'resp_sdk_contract', object: 'response', created_at: 0, status: 'completed',
      output: [{ id: 'msg_contract', type: 'message', role: 'assistant', status: 'completed', phase: 'final_answer',
        content: [{ type: 'output_text', text: '{"ok":true}', annotations: [] }] }],
      usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
    }, { headers: { 'x-request-id': 'sdk-contract-request' } });
  },
});
const provider = new OpenAIProvider(parseConfig({}), 'sdk-contract-test-not-a-real-key', [], undefined, client);
const result = await provider.complete('triage', s.object({ ok: s.boolean() }), { text: 'synthetic transport contract' });
assert.deepEqual(result.value, { ok: true });
assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 4 });
assert.equal(result.requestId, 'sdk-contract-request');
assert.equal(requests, 1);
process.stdout.write('Official OpenAI SDK Responses transport contract passed (stub HTTP; no live model call).\n');
