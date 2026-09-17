# Reproducible offline maintenance demo

This is synthetic teaching/test data, not a real GitHub project or a model benchmark.
All issue numbers, PRs, identities, commits, releases and generated GitHub links in
the fixture are fictional. The model answers are deliberately hand-authored and
marked `provider: fixture`. No fixture report can be posted by the application.

## Run it

From the Codex Maintainer source root after dependency installation:

```bash
npm run build
node dist/cli/index.js demo --output-dir demo-output
npm --prefix examples/demo-repository test
```

The first command builds **Codex Maintainer**, not code retrieved from a PR. The demo
injects a fixed GitHub HTTP transport and fixture AI provider into the same Maintainer
application used by the CLI and Action. It generates:

```text
demo-output/
  context.json
  triage.md
  triage.json
  review.md
  review.json
  release.md
  release.json
```

The fixture transport allows only reads and never makes a network request.
Report contents are deterministic; `generatedAt` timestamps vary between runs. The
sample repository tests are run only when you explicitly invoke the separate
`npm --prefix ... test` command; the Maintainer analysis never executes them.

## The three scenarios

**Issue #123:** a caller supplies an invalid `pageSize`. The baseline implementation
validates page number but not page size. Triage asks about expected error handling,
suggests the function and tests, and proposes edge cases to reproduce.

**PR #456:** `proposed-change.diff` changes `(pageNumber - 1) * pageSize` to
`pageNumber * pageSize`. A one-based first page then skips its first items. The
fixture finding is grounded on line 5 of the changed right-hand side. The baseline
first-page test demonstrates the expected behavior. The proposed broken code is
not installed or executed by the maintenance pipeline.

**Release v1.2.0:** three synthetic observed commits and two merged PR associations
produce Features, Fixes and Documentation entries. The pipeline suppresses
commit/PR duplicates, checks source IDs, preserves uncategorized records and builds
contributors from the observed GitHub logins. These are fixture API records, not
an actual git history hosted at `demo/pagination`.

## Change and inspect

`fixtures.json` has two sections: `routes` for documented GitHub response subsets and
`responses` for task answers. Change a review line to 999 and rerun: the finding is
removed with a warning. Change a release `sourceId` to an unknown PR: generation
fails closed. These are deterministic contract demonstrations, not evidence that a
live model would make the same findings. The full test suite automates these cases.
