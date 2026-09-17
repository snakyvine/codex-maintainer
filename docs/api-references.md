# Official API references

Documentation was checked on 2026-09-17. Model access and API behavior can change;
re-run the SDK contract and live smoke tests when upgrading. These references explain
API choices, not proof that the authoring environment made successful live requests.

## OpenAI

- [GPT-5.3-Codex model](https://developers.openai.com/api/docs/models/gpt-5.3-codex):
  the selected documented coding model; Responses and Structured Outputs support.
  It is an explicit default, not a claim to be the newest model.
- [GPT-5.3-Codex guide](https://developers.openai.com/api/docs/guides/latest-model/gpt-5.3-codex):
  direct API usage. This integration is single-turn; it selects final-answer content
  and does not replay an agent conversation or tool results.
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs):
  the Responses request uses `text.format` with `type: json_schema`, `strict: true`
  and the same deliberately limited schema used for local validation.
- [Official JavaScript SDK](https://github.com/openai/openai-node):
  `client.responses.create`, constructor options, retries, timeouts and request IDs.
- [Pinned SDK release v7.9.0](https://github.com/openai/openai-node/releases/tag/v7.9.0):
  the source dependency is pinned, not an unspecified latest SDK.
- [Data controls](https://developers.openai.com/api/docs/guides/your-data):
  review retention rules separately from the request's `store: false` setting.

No custom Codex API path or agent SDK method is used. The official SDK targets
`https://api.openai.com/v1/responses`. The adapter fixes that origin rather than
accepting a repository-supplied endpoint.

## GitHub

- [Pull requests](https://docs.github.com/en/rest/pulls/pulls): descriptions, immutable
  base/head SHAs and paginated changed files; the files endpoint has a 3,000-file cap.
- [Git trees](https://docs.github.com/en/rest/git/trees) and
  [Git blobs](https://docs.github.com/en/rest/git/blobs): bounded, commit-pinned source
  reads without checkout, symlink following or raw-content redirects.
- [Commits](https://docs.github.com/en/rest/commits/commits): compare pagination,
  ancestor status and PR associations for observed commits.
- [Issue comments](https://docs.github.com/en/rest/issues/comments): both issue and PR
  recommendation comments use this API; relevant fine-grained write permission is
  separate from read-only analysis.
- [Action security](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target):
  privileged fork-event risks. This Action rejects `pull_request_target` rather than
  claiming that a prompt or config flag makes a privileged checkout safe.
- [setup-node](https://github.com/actions/setup-node) and
  [checkout](https://github.com/actions/checkout): workflow dependencies pinned to
  reviewed release SHAs in this distribution. Only project CI checks out project
  source; the consumer Action does not check out target PR source.

GitHub REST requests set `X-GitHub-Api-Version: 2026-03-10`, use the GitHub.com API
origin, reject redirects and enforce their own attempt/body budgets. GHES hosts
and arbitrary API origins are intentionally not configuration options.
