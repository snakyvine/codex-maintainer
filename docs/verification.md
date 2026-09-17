# Source distribution verification

## GitHub upload verification — 2026-09-17

The source was verified on Windows with Node.js 24.19.0 and npm 10.9.2 before
uploading to https://github.com/snakyvine/codex-maintainer.

- Installation from the npm registry succeeded and generated `package-lock.json`
  with exact dependency versions and registry integrity records.
- `npm run check` passed, including lint, strict type checking, all 62 tests,
  build, and repository audit.
- `npm run test:sdk` passed with the real OpenAI 7.9.0 SDK and a stub HTTP transport.
- `npm run audit:release` passed with the generated lockfile.
- A Windows path-separator issue in the documentation-link audit was corrected.

These checks supersede the initial lockfile and SDK blockers below. They do not
claim live model evaluation, paid API calls, or production integration testing.
See the repository's Actions page for hosted CI results.

## Initial archive verification history

The initial implementation was checked on 2026-09-17 in an isolated Linux container,
using Node.js 22.16.0, npm 10.9.2, TypeScript 5.8.3 and Commander 13.1.0. TypeScript,
Commander and Node type definitions were available from preinstalled local packages.
They were not replaced with mock libraries.

### Executed checks

| Check | Observed result |
| --- | --- |
| `npm run lint` | Passed; production-source AST safety rules and script syntax |
| `npm run typecheck` | Passed; strict TypeScript compile without emit |
| `npm test` | Passed: 62 tests, 0 failed, 0 skipped, 0 pending |
| `npm run build` | Passed; CLI, Action runtime and JSON schemas emitted |
| `npm run check` | Passed; combined lint/typecheck/tests/build/repository audit |
| `npm run audit:repo` | Passed with an explicit missing-lockfile warning |
| Offline CLI demo | Passed; context plus three Markdown and three JSON reports |
| Sample repository tests | Passed: 2 baseline pagination tests |
| Compiled CLI help/subcommands/symlink-style entry | Passed in the automated tests |
| Action, CI, template and example YAML parsing | Passed with a local YAML parser |
| `npm pack --ignore-scripts` | Passed; runtime entry points, fixture and license included; no node_modules, test-build or .env |
| `npm install --ignore-scripts --fetch-retries=0 --fetch-timeout=5000` | Blocked: npm registry DNS resolution failed (`EAI_AGAIN`) |
| `npm run test:sdk` | Blocked: official openai package unavailable; command exits 1 and explicitly says NOT RUN |
| `npm run audit:release` | Correctly refuses release: registry-generated lockfile missing |
| Clean install, live APIs and hosted Action | Not performed; no live behavior or model accuracy claim |

The complete successful aggregate-command transcript is provided alongside the
source download. `verification-results.json` records the machine-readable status.
No GitHub-hosted CI run, paid OpenAI call, GitHub comment write or independent
security certification is claimed here.

### Installation boundary

An actual `npm install --ignore-scripts --fetch-retries=0 --fetch-timeout=5000`
was attempted. It failed with `EAI_AGAIN` resolving `registry.npmjs.org` while
fetching `openai`. The container could not download the official SDK. The build uses
a structural provider boundary and lazy loading, so deterministic tests and the
CLI's no-key workflows can run using the locally available development tools.

The official OpenAI SDK is declared as an exact runtime dependency, not implemented
or imitated by this repository. Tests inject a small SDK-client interface where
needed. The separately provided `npm run test:sdk` requires the real package and
cannot be marked passed in this environment. A clean npm install, real-SDK contract,
live OpenAI/GitHub requests and hosted Action run remain unverified.

No lockfile is supplied: a registry-generated lock and integrity metadata could not
be obtained. Top-level dependencies are exact-pinned, but that does not substitute
for a reviewed lockfile. `npm run audit:release` is a separate strict gate that will
reject this initial handoff until the publisher generates and verifies the lock.

The fixture demo is an executed end-to-end deterministic pipeline, not a paid-model
evaluation. All demo identities and activity are synthetic. See
[publishing](publishing.md) for the commands and live smoke tests required before
a public production release. No claim is made that the original request's clean
installation and real-integration validation requirements have been fully completed.
