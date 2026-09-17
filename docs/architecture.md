# Architecture and contracts

## Boundaries

```text
CLI / Action policy
       |
       v
Maintainer orchestration ------ explicit comment gate --> GitHub issue comments
       |
       +--> GitHubHttp --> GitHubClient --> RemoteSource (immutable commit/blob SHAs)
       |                              \-> LocalSource (analyze only)
       |
       +--> Context index + ranked excerpts + diff/release evidence
       |
       +--> AIProvider --> OpenAIProvider --> official SDK Responses API
       |
       +--> schema validation + evidence grounding + redaction --> report renderers
```

The deterministic code owns collection, limits, output validation and writes. The
model owns only interpretation of supplied evidence. A `RepositorySource` offers a
bounded `read()` and file index, not a filesystem API or command executor. A provider
gets a task, schema and JSON evidence, not a GitHub client or shell interface.

## Directory map

| Path | Responsibility |
| --- | --- |
| `src/cli` | Commander arguments, env validation, stdout/files, opt-in commenting |
| `src/action` | Event/author/fork gates, step summary, runner output paths |
| `src/github` | Response subsets, fixed-origin HTTP, retries, pagination and comment ownership |
| `src/analysis` | Local/remote snapshots, manifests, context cache and bounded excerpt ranking |
| `src/codex` | Provider contract, static policy and official SDK adapter |
| `src/triage` | Issue result schema, existing-label and excerpt-path checks |
| `src/review` | Unified patch parser, budgets, side/line/quote checks |
| `src/release` | Ancestor selection, commit/PR evidence, source-linked categories |
| `src/core` | Small schema vocabulary, config, redaction, safe file writes, rendering and errors |
| `src/app.ts` | End-to-end read/analysis/report pipelines; separate explicit write method |
| `tests` | Native Node tests with synthetic transports and fixture inputs |
| `scripts` | Build, safety lint, SDK contract and repository/release audits |
| `dist` | Committed compiled CLI/Action and generated output schemas |
| `examples` | Demo source, synthetic transports, generated outputs and workflows |

There is no plugin loader or custom repository prompt execution. REST is sufficient
for this scope; GraphQL would add a second error/pagination surface without removing
a needed REST capability.

## Public interfaces

The stable user surfaces are CLI options, JSON config keys, Action inputs/outputs
and JSON report schema versions. Internal TypeScript modules are not yet a supported
published library API. Their interfaces remain explicit to make tests and future
provider changes manageable.

The model result boundary is:

```typescript
interface AIProvider {
  complete<T>(task: Task, schema: Schema<T>, evidence: unknown): Promise<AIResult<T>>;
}
```

`Task` is `triage | review | release`. An `AIResult` contains validated `value`,
provider provenance, model, optional token usage and request ID. Production uses
`OpenAIProvider`; the offline demo uses `fixtureProvider`, always reports fixture
provenance and is categorically ineligible for comments.

The adapter dynamically loads the **official installed `openai` package**, using
its documented CommonJS/default constructor. This is a lazy dependency boundary,
not a replacement SDK or an HTTP fallback. Local analysis and the fixture demo can
operate without loading it. A small structural `ResponsesClient` type isolates
SDK-specific types and lets unit tests inject transport behavior. `npm run test:sdk`
is the separate real-SDK contract test; it must pass after installing or upgrading
the SDK. See [API references](api-references.md).

Each report contains:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Currently string `"1"`; independent of package version |
| `task`, `repository`, `target` | Operation and target issue/PR/version |
| `sourceRef`, `headRef` | Context/base SHA and PR head/release target SHA when applicable |
| `generatedAt` | Report generation time; not a GitHub resource modification time |
| `provider`, `model` | `openai` or `fixture`, and model identifier |
| `usage`, `requestId` | SDK token usage / request ID when supplied, otherwise null |
| `warnings` | Coverage, truncation and filtering notices |
| `data` | Task-specific validated result and deterministic coverage/evidence |

`dist/schemas/triage.json`, `review.json` and `release.json` describe the **model
result**, not the entire report envelope. `context.json` describes the repository
index. Deterministic fields such as review coverage and retained release evidence
are added after model validation; see their TypeScript interfaces.

## Context and review consistency

Remote context uses the PR's base SHA, not its moving branch name or untrusted head.
The PR is fetched before and after paginated changed-file collection. A head/base
change rejects that collection. Source excerpts remain base-side context; the diff
represents proposed changes. The complete PR head is never checked out.

Context caches contain paths and metadata, not a source archive. A matching
repository/ref/fingerprint is required. They are not cryptographically authenticated
against a malicious local cache author; local cache directories belong to the
operator's trusted working environment. Actions neither read nor write a repository
cache. They produce reports in runner temporary storage.

Diff lines are indexed before redaction. A review finding must quote at least three
characters from the actual changed line at its claimed file and `LEFT`/`RIGHT` side.
Context-only lines and invented paths are rejected, with an explicit removal count.
This proves the location exists; it does not validate the bug argument. A partial
diff remains partial even when its visible lines contain a valid finding.

## Release semantics

An explicit `--from` is preferred for reproducibility. Automatic selection checks
up to 30 newest published stable releases, skips the target itself and requires an
ancestor relation. The target and base refs are resolved once to immutable SHAs.
A diverged/behind or empty range fails rather than producing speculative notes.

Commit collection is paginated and budgeted. Per-commit PR associations are filtered
to merged PRs in this repository. A PR becomes an entry only when its merge SHA is
among observed commits; otherwise commits remain available. PR numbers are deduped,
and commits already represented by an included PR do not produce duplicate records.
Model entries must cite known nonempty source-ID lists. Observed records the model
omits become Maintenance entries. Partial history yields explicitly partial notes.

## Failure policy

Unknown data, malformed model output, refusals, incomplete responses, stale PRs,
oversized inputs, bad credentials and exhausted budgets fail closed. No model output
is interpreted as executable instructions. JSON logs do not include request bodies,
credentials, source excerpts or raw upstream error text.

GitHub read requests retry network errors, interrupted bodies, 408, 429, qualifying
403 limits and server errors at most twice. A `Retry-After` greater than 30 seconds
returns a rate-limit error instead of retrying early. Writes are never retried
automatically because a lost response can follow a successful comment creation.
The SDK handles its own bounded retries; the provider adds no second retry loop.
