# Codex Maintainer

**Evidence-first issue triage and pull request review. Maintainers keep the final say.**

Codex Maintainer is a CLI and GitHub Action that reads repository context, asks an
OpenAI coding model for a structured analysis, and checks the result against the
available evidence. It recommends; it does not approve, merge, close, or fix code.

```text
Issue / Pull Request / Commit Range
                 |
          Codex Maintainer
                 |
      Repository Context + Evidence
                 |
       Structured Model Analysis
                 |
    Schema + File/Line/Source Checks
                 |
       Maintainer Recommendation
       (terminal, file, or comment)
```

**Distribution status:** public source repository at
[snakyvine/codex-maintainer](https://github.com/snakyvine/codex-maintainer), not yet
published to npm or the GitHub Marketplace. Start with the no-key demo. Review the
[verification record](docs/verification.md) and [release gates](docs/publishing.md)
before publishing or giving it production credentials. This is an independent
project, not an official OpenAI project or an endorsed integration.

## What it does

| Command | Result | Default side effect |
| --- | --- | --- |
| `triage 123` | Issue type, evidence-backed files, investigation steps, questions and recommended labels | Prints a report |
| `review 456` | Correctness/security/breaking-change findings with changed-line evidence and test recommendations | Prints a report |
| `analyze` | Structure, language counts, dependency names, test/CI paths and important-module candidates | Writes `.codex-maintainer/context.json` |
| `release v1.2.0` | Source-linked Markdown release notes from commits and merged PR metadata | Prints notes |
| GitHub Action | Triage or review on eligible `issues` / `pull_request` events | Writes a job summary and temporary report files |

There is no automatic label application, code edit, command execution, issue
closure, PR approval, merge, or release publication. `--comment` and the Action's
`comment: 'true'` are explicit opt-ins to a single recommendation comment.

## Why

Maintenance is often an evidence-gathering problem: locating the relevant code,
checking the actual diff, separating a plausible defect from a style preference,
and tracing release notes back to changes that really landed.

A useful assistant needs boundaries around that work. Codex Maintainer pins remote
context to commit SHAs, budgets the evidence, validates model output, rejects
invented review locations and release references, and states what it did **not**
inspect. A valid quotation still does not prove a bug; the maintainer decides.

## Quick Start

Use Node.js **22 or newer** and npm. Clone the repository first:

```bash
git clone https://github.com/snakyvine/codex-maintainer.git
cd codex-maintainer
```

From the source checkout or extracted archive:

```bash
npm ci --ignore-scripts
npm run check
npm run test:sdk
npm link --ignore-scripts
codex-maintainer --help
codex-maintainer demo
```

The demo needs **no credentials and no network after installation**. Open
`demo-output/triage.md`, `review.md`, and `release.md`. The supplied API responses
and model answers are hand-authored synthetic fixtures, not a live AI run or an
accuracy benchmark. They exercise the same collection, validation and rendering
pipelines as live commands. See [the complete example](examples/demo-repository/README.md).

There is deliberately no `npx codex-maintainer` example until an npm publication
actually exists. Without a global link, replace `codex-maintainer` with
`node /absolute/path/to/codex-maintainer/dist/cli/index.js`.

### Credentials for live use

Create an OpenAI API key with access to the configured model and a repository-scoped
GitHub token. In **Bash**, these prompts avoid putting key values in shell history:

```bash
read -r -s -p 'OpenAI API key: ' OPENAI_API_KEY; printf '\n'
export OPENAI_API_KEY
read -r -s -p 'GitHub token: ' GITHUB_TOKEN; printf '\n'
export GITHUB_TOKEN
export GITHUB_REPOSITORY='YOUR_OWNER/YOUR_REPOSITORY'

codex-maintainer triage 123
codex-maintainer review 456
```

Replace the owner/repository and resource numbers with your repository's values.
Never commit credentials. Environment variables are read by the process; `.env`
files are **not loaded automatically**. The no-key local `analyze` command and the
offline `demo` do not need either variable. Remote `analyze` needs only `GITHUB_TOKEN`.

## CLI Usage

```bash
# Local inspection: no model, GitHub access, install scripts or test execution.
codex-maintainer analyze
codex-maintainer analyze --root examples/demo-repository

# Commit-pinned remote index; writes a cache in the current directory.
codex-maintainer --repo YOUR_OWNER/YOUR_REPOSITORY analyze

# Recommendations only. In a GitHub checkout the CLI can infer origin.
codex-maintainer triage 123
codex-maintainer review 456 --format json --output review.json

# Explicit write: permission + fresh issue/PR + matching bot-owned comment.
codex-maintainer review 456 --comment

# Existing release tag; finds the newest published stable ancestor release.
codex-maintainer release v1.2.0

# Unpublished version or an explicit, reproducible comparison range.
codex-maintainer release v1.2.0 --from v1.1.0 --to main --output RELEASE_NOTES.md

# Local overrides; unknown keys and unsafe/unbounded settings are rejected.
codex-maintainer --config examples/config.json --quiet review 456
```

`triage`, `review`, and `release` support `--format markdown|json` and `--output`.
Reports go to stdout; operational logs and errors go to stderr. Exit code 0 means
a report was produced, not that a PR is safe; errors exit 1. JSON reports carry
`schemaVersion`, source/head refs, model, token usage when available, warnings and
structured `data`. See [report and provider contracts](docs/architecture.md).

Repository selection for live commands is `--repo`, then `GITHUB_REPOSITORY`, then
the current checkout's `.git/config` origin. Worktrees with a `.git` pointer file
need an explicit `--repo`. Local `analyze` remains local unless `--repo` is given;
it never silently uploads your working tree.

A cache is reused only when repository, ref, path fingerprint and relevant settings
match. Local working-tree contexts are not substituted for a remote PR base snapshot.
Live commands automatically construct the needed context; running `analyze` first
is optional. Only `analyze` writes a persistent context cache.

## GitHub Action

Publish this repository under your GitHub owner and tag a validated release first.
Replace `YOUR_OWNER` below. In sensitive repositories, replace `@v1` with the full
reviewed release commit SHA. Add an `OPENAI_API_KEY` repository or environment secret.

```yaml
name: Maintainer recommendations
on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]
  issues:
    types: [opened, reopened]
permissions:
  contents: read
  issues: read
  pull-requests: read
concurrency:
  group: codex-maintainer-${{ github.event_name }}-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: true
jobs:
  recommend:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: YOUR_OWNER/codex-maintainer@v1
        id: maintainer
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          github-token: ${{ github.token }}
          comment: 'false'
```

No target-repository checkout is needed. The composite Action sets up Node 24,
installs **its own** dependencies with lifecycle scripts disabled, and executes
committed `dist/action/index.js`. It never installs dependencies from the PR or
runs repository scripts. It uses `npm ci` when its lockfile is present, with an
exact-version `npm install` fallback for this initial source distribution. The
publisher must generate and validate a lockfile before a release.

By default it skips drafts, fork PRs, and issues by authors other than owners,
members or collaborators. Fork PRs normally do not receive the OpenAI secret;
`allow-forks: 'true'` does not change GitHub's security rules. Use the CLI as a
maintainer for those reviews. `pull_request_target` and `workflow_run` are rejected.
See [the security boundary](docs/security.md), rather than adding a privileged workaround.

Set `allow-external-issues: 'true'` only after accepting the API-spending risk of
public submissions. For explicit PR comments use the separate
[comment workflow](examples/workflows/pr-comment.yml), which grants
`pull-requests: write` but not `contents: write`. Issue comments require
`issues: write`. One comment per task/actor is updated instead of repeatedly added;
there is an optimistic concurrency check, not a transactional GitHub write lock.
Use the default Actions token for predictable `github-actions[bot]` ownership.

### Action inputs and outputs

| Input | Default | Meaning |
| --- | --- | --- |
| `openai-api-key` | none | Actions secret; required for eligible live events |
| `github-token` | `${{ github.token }}` | Default Actions token; scope it in the workflow |
| `model` | repository config/default | Optional model override |
| `comment` | `'false'` | Explicit recommendation-comment write |
| `allow-forks` | `'false'` | Analyze forks only when credentials are safely available |
| `allow-external-issues` | `'false'` | Permit API usage for non-collaborator issues |

Outputs are `status` (`completed` or `skipped`), `report-path`, `json-path`, and
optional `comment-id`. Paths point to runner temporary files, not repository files;
they are not uploaded automatically. The Markdown is also placed in the job summary.
Reports can contain source excerpts and should not be uploaded to public artifacts
without review. The Action needs network access to npm, GitHub and OpenAI.

## Examples

The synthetic [demo repository](examples/demo-repository/) contains a pagination
function, a proposed off-by-one change, baseline tests and transport fixtures.
Generated sample reports are in [examples/demo-output](examples/demo-output/).

**Issue -> triage:** the reporter passes `pageSize=0`. The supplied fixture answer
classifies it as a bug, suggests `src/paginate.js`, and asks whether invalid sizes
should throw. Suggested investigations include zero, negative and fractional sizes.

**PR -> review:** an excerpt from the actual generated fixture report:

```text
Coverage: 1/1 changed files; 0 partial diffs; 0 omitted files.

HIGH: The first page skips the first pageSize items
src/paginate.js:5 (RIGHT) | confidence: high

For pageNumber=1 and pageSize=2, the new start is 2 instead of 0.
The first page returns items 3 and 4, and subsequent pages are shifted.

Evidence: const start = pageNumber * pageSize;
```

**Commits -> release notes:** synthetic merged PRs `#11` and `#12` become feature
and fix entries; a direct documentation commit remains a commit-linked entry.
Uncategorized observed changes are retained under Maintenance instead of silently
omitted. Demo identities, issues, PRs, commit SHAs and release links are not real
project activity. Hand-authored answers demonstrate the pipeline, not model quality.

## Configuration

Commit `.codex-maintainer.json` to the target repository, or pass `--config` to the
CLI. Start from [examples/config.json](examples/config.json). PR review reads
configuration and context from the **base SHA**, never from the proposed head.
Triage and release configuration come from the default-branch snapshot.

`--config` replaces repository configuration rather than merging it. The model
priority is `--model` / Action `model`, then `CODEX_MAINTAINER_MODEL`, then JSON
configuration, then `gpt-5.3-codex`. No base URL, shell command, custom prompt, tool,
or arbitrary network destination can be supplied through repository configuration.

| Setting | Default | Accepted range / meaning |
| --- | --- | --- |
| `model` | `gpt-5.3-codex` | Model supporting Responses API and strict Structured Outputs |
| `maxFiles` | 60 | 1-200 reviewed diff files |
| `maxDiffChars` | 90,000 | 1,000-300,000; includes conservative location/JSON overhead |
| `maxFileBytes` | 16,000 | 1,000-100,000; oversized source files are skipped, not fully loaded |
| `maxContextFiles` | 8 | 1-24 source excerpts |
| `maxContextChars` | 48,000 | 2,000-150,000 total excerpt characters |
| `maxOutputTokens` | 6,000 | 1,000-24,000; incomplete model responses fail closed |
| `maxCommits` | 200 | 1-500; large ranges may also hit the GitHub request budget |
| `excludePaths` | `[]` | Literal repository-relative paths or directory prefixes; no globs |

The GitHub client also has a 400-request attempt budget and an 8 MB per-response
limit. The prompt is capped at 500,000 characters. A logical model request can
incur up to two SDK retries; this is not a fixed dollar budget. Lower limits, omit
commenting and restrict triggering actors when trialing the tool.

## Permissions

Use a fine-grained GitHub token limited to the repository being analyzed. GitHub
also requires access to repository metadata. Organization policy may require approval.

| Operation | Repository permissions |
| --- | --- |
| Local analysis / fixture demo | None |
| Remote analysis | Contents: read |
| Issue triage | Contents: read; Issues: read |
| PR review | Contents: read; Pull requests: read |
| Release notes | Contents: read; Pull requests: read |
| Explicit issue recommendation comment | Contents: read; Issues: write |
| Explicit PR recommendation comment | Contents: read; Pull requests: write |

No workflow needs `contents: write`, administration, workflow modification, or
`write-all`. Prefer the short-lived default GitHub token in Actions. The CLI's
comment mode resolves the authenticated token owner; the Action expects the default
bot identity. A custom PAT in an Action can change comment ownership and cause
additional comments, so it is not the documented commenting setup.

## Security

Repository text, issue bodies, diffs, filenames and model output are untrusted.
The model receives data, not repository-supplied instructions. It has **no tools**:
no shell, filesystem, browser, code interpreter or GitHub mutation access.

The implementation excludes common secret/generated/binary paths, redacts known
credentials and common secret patterns, bounds reads, does not follow repository
symlinks, escapes model-controlled Markdown/HTML/mentions, and verifies review
findings against the visible changed side, line and quotation. Release entries
must cite observed source IDs. Reports, including retained release evidence, are
sanitized before output. No guarantee of complete secret detection is made.

Selected source and issue/PR text are sent to OpenAI for live analysis. Do not use
it on code you cannot disclose to that service. `store: false` disables Responses
storage for these requests; it is **not a promise of zero retention** or a replacement
for checking your account's data controls. There is no separate project telemetry.

The prompt is not a complete injection defense, and evidence validation does not
prove semantic correctness. Read [SECURITY.md](SECURITY.md) and the detailed
[threat model](docs/security.md). Human review remains required.

## How it works

Codex Maintainer uses OpenAI models to understand repository context and assist
maintainers with issue triage, PR review and release workflows.

`src/codex/` isolates the official OpenAI JavaScript SDK. The default model is the
currently documented `gpt-5.3-codex`, called through **`client.responses.create()`**
with a strict JSON schema in `text.format`, `store: false`, no tools, and bounded
output. There is no invented Codex endpoint, unofficial authentication flow, Codex
CLI dependency, or autonomous agent loop. The choice is intentional: bounded coding
analysis is enough for this read-only maintenance MVP.

GitHub REST reads collect immutable base context and structured per-file patches.
A deterministic filename/entry-point ranking selects excerpts; there is no embedding
index or whole-repository comprehension claim. Domain logic validates structured
answers, filters unsupported review locations, and formats a recommendation.
Writes are a separate explicit step with a fresh issue timestamp or PR head/base
check. See [architecture](docs/architecture.md) and [official API references](docs/api-references.md).

### Current limits

GitHub.com only; no GHES or GitLab. No test execution or proof of bug absence.
Changed-line evidence only, not whole-program analysis or formal GitHub review
approval. Large/binary/omitted patches reduce coverage and are reported. Dependency
and framework detection is heuristic. Local analysis is a bounded filesystem walk,
not a full Git-ignore implementation. Source ranking is primarily filename-based.

Release notes summarize titles, bounded bodies and observed commits; squash/rebase
histories can fall back to commit entries when an associated PR cannot be confidently
placed in the range. The first release needs `--from`. Contributor lists use GitHub
logins available in the included evidence, not a full co-author/email census.
Initial distribution validation limits are recorded in [verification](docs/verification.md).

## Roadmap

The next priorities are a human-labeled review/triage evaluation set, approved
maintainer-triggered fork reviews without privileged head checkout, and a smaller,
reproducible dependency-bundled Action with a reviewed lockfile/SBOM. None is claimed
as an implemented feature. Automatic code modification is outside this MVP's scope.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). CI runs lint, strict type checking, tests,
build, the official SDK transport contract and repository audit on Node 22 and 24.
CI is configured here; a hosted GitHub run is not implied by this source distribution.
Bug reports should include a synthetic reproduction and sanitized error output.
Security reports follow [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Dependencies retain their own licenses; see
[third-party notices](THIRD_PARTY_NOTICES.md).
