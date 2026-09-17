# Changelog

Versions follow Semantic Versioning. A section here is not proof that its version
has been published; GitHub release tags are the release record.

## 1.0.0 - Unreleased

### Added

- Issue triage with bounded repository evidence, existing-label recommendations,
  and investigation questions.
- PR correctness review with changed-line/quotation validation and explicit
  partial-coverage reporting.
- Local and commit-pinned remote repository context generation.
- Source-linked release notes from ancestral commit ranges and merged PR metadata.
- Read-only-by-default composite GitHub Action and explicit idempotent comments.
- Official OpenAI SDK Responses adapter, schema validation, sanitized Markdown,
  fixed-origin GitHub client, bounded retries, and stale-report checks.
- Deterministic offline fixture demo, tests, CI, and security/release documentation.

### Changed

- Upgrade the OpenAI SDK to 7.15.0, verified with the SDK transport contract.
- Upgrade Commander to 15.0.0 and require Node.js 22.12.0 or newer; CI now
  exercises that minimum version as well as current Node 22 and 24.
- Keep automatic TypeScript and Node type-definition updates within their current
  major versions until compiler-API migration and runtime compatibility are reviewed.

### Release status

The source is available at https://github.com/snakyvine/codex-maintainer.
It has not been tagged as a release or published to npm. See
[verification](docs/verification.md) for completed checks and remaining release gates.
