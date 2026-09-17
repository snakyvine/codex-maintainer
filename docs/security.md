# Threat model and operating boundary

## Assets and trust

Assets are repository source, API credentials, the maintainer's attention, GitHub
write authority and paid API capacity. Adversaries may control issue text, PR
metadata, filenames, patches, documentation, manifests and model-visible source.
They may try to inject instructions, leak secrets, forge findings, trigger mentions,
exhaust budgets, or make the tool execute PR code.

The installed Codex Maintainer release, its dependencies, your workflow and the
operator's local machine are trusted. GitHub and OpenAI are external services. A
malicious dependency, runner administrator or prior job step executing hostile code
can defeat process-local controls. This is not a hardened multi-tenant sandbox.

## Controls and residual risks

| Attack | Control | Residual risk |
| --- | --- | --- |
| Prompt injection in an issue, diff, README or AGENTS file | Static system policy; all repository material explicitly untrusted; no model tools | The model can still produce misleading prose or bad priorities |
| Arbitrary shell/code execution | Production source has no command-execution interface; model output is data; no target checkout/install | A compromised tool dependency or workflow can execute code |
| Model-directed data exfiltration | No model network tools; GitHub origin fixed; redirects refused; output links/HTML/images escaped | Selected input is intentionally sent to OpenAI; prose can still disclose overlooked sensitive data |
| Leaking keys through input/output | Secret-path exclusions, exact configured-secret and common-pattern redaction, final report sanitization | Redaction is best-effort, not DLP; credentials can be obfuscated or appear in unfamiliar formats |
| Forged file/line findings | Changed-side/line/path and literal-quote checks | A location can be real while the bug claim is wrong |
| Fabricated release references | Known source-ID allowlist; deterministic contributors; uncategorized changes retained | Descriptions and categories can still be inaccurate |
| Comment spam or editing others' comments | Explicit opt-in, own-author exact marker, latest matching comment, bounded history, unchanged-body no-op | Concurrent runs have a small read/write race; use workflow concurrency |
| Stale feedback | Compare PR base/head during collection and again before posting; issue update timestamp before posting | GitHub does not provide a transactional conditional comment-write API here |
| Privilege escalation through forks | Default fork/draft skip; privileged event types rejected; no PR head checkout | A maintainer can still misconfigure their surrounding workflow or runner |
| Public-input spending attacks | External issues skipped by default; bounded context/files/requests/output; job timeout examples | No global daily dollar cap; repeated authorized events can still cost money |
| Malicious paths or symlinks | Git tree uses only regular blobs; local reads reject symlinks/traversal; atomic local report writes | Concurrent hostile filesystem mutation is outside the trusted-local-workspace model |

No output should be treated as an approval, security clearance or test result. Even
an empty finding list says only that no evidence-backed findings survived in the
reviewed scope. Diff/line grounding does not establish exploitability or correctness.

## Data sent and stored

Live model input includes bounded issue/PR title/body, selected redacted base source
excerpts, repository path/manifest/test/CI metadata, visible changed diff lines, or
release change titles and bounded commit/PR bodies. It does not include GitHub
comments/history beyond metadata needed to maintain the tool's own recommendation
comment. There is no embedding service, project telemetry or separate analytics sink.

The OpenAI request uses `store: false`. Review your organization's OpenAI data
controls and retention arrangements; this flag alone does not establish zero data
retention. Never submit source you are not permitted to disclose. Generated report
files, comments, job summaries and artifacts may themselves contain sensitive
source quotations. Review them and GitHub's visibility settings before publishing.

`GITHUB_TOKEN` and `OPENAI_API_KEY` come from the process environment. The project
does not load target `.env` files. Its GitHub endpoint and OpenAI base URL are fixed;
repository content cannot redirect either client. Credentials are not deliberately
written to logs, caches, fixture files or reports. Exact configured keys and common
patterns are also removed at the final report boundary, including release evidence.

## GitHub Actions deployment

Use a fresh GitHub-hosted runner or an equivalently isolated ephemeral runner. Put
this Action in a job that has not run untrusted repository commands. A previous
step can compromise the runtime, output files or environment even when this Action
itself does not check out the PR.

The documented setup uses the default GitHub Actions token. Start with read
permissions and `comment: 'false'`. Promote only the relevant Issues or Pull
requests permission to write after reviewing outputs. Never grant `write-all` or
Contents write for this tool. Restrict OpenAI credentials and set account usage
alerts/limits separately; those controls are not managed by this repository.

`pull_request` from forks ordinarily lacks repository secrets. `allow-forks` permits
analysis only when credentials are already safely available; it does not create,
forward or recover credentials. A missing secret in that case produces a skipped
run. Dependabot runs without an OpenAI secret also skip. For public fork reviews,
use the CLI under a maintainer's control. There is no implemented `/review` command
handler or privileged two-workflow workaround in this release.

Inputs `comment`, `allow-forks` and `allow-external-issues` accept only the literal
strings `true` and `false`. PR base/default-branch JSON settings can alter bounded
analysis limits, but cannot enable GitHub writes, change origins or introduce tools.

## Dependencies and release integrity

The composite Action installs dependencies in its own downloaded action directory,
not in the target repository. Lifecycle scripts are disabled and setup-node caching
is disabled. Dependencies have exact top-level versions. A reviewed package lock
must be generated before release; a missing lock in the initial source handoff is
an explicit supply-chain validation gap, not a reproducibility claim.

Pin the published Action to a reviewed full commit SHA, protect release branches,
check generated `dist/` changes and run the real-SDK transport test after upgrades.
The repository audit and custom lint rules are regression guards, not comprehensive
SAST, dependency vulnerability scanning or an independent security audit.
