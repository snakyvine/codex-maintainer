# Contributing

Changes should make maintenance more reliable, not make the model more autonomous.
A useful contribution has a reproducible problem, an observable improvement and a
failure-mode test. For larger changes, discuss the behavior in an issue first.

## Development

Use Node.js 22.12.0 or newer. Install dependencies without lifecycle scripts:

```bash
npm install --ignore-scripts
npm run lint
npm run typecheck
npm test
npm run build
npm run test:sdk
npm run audit:repo
```

`npm test` runs the TypeScript build and the native Node test runner. It does not
need credentials or network access once dependencies are installed. `test:sdk`
additionally exercises the **real installed OpenAI SDK** with a stub HTTP transport;
it is not a live-model test. The linter is a small TypeScript compiler-API safety
check (not ESLint): it rejects explicit `any`, unsafe assertions, ignored promises,
raw console logging, and process-execution imports in production source.

The Action executes committed `dist/` files. Run `npm run build` and include `dist/`
changes in source PRs. CI rejects a stale build. Do not hand-edit generated files.

## Before submitting

Add or update tests for valid input, hostile input, missing data and upstream
failure. Keep source evidence, provider output, and presentation separate. Keep
all model calls inside `src/codex/`, and validate provider output again at the domain
boundary. Never add repository code execution, model-directed fetches, automatic
approval/merge/close, or hidden token writes as incidental changes.

Do not include real issues, private code, API responses or credentials in fixtures
without explicit permission. Demo identities and outputs must remain clearly
synthetic. Do not describe fixtures as model-quality evaluations.

Explain behavior changes and limitations in the PR. Update the README, examples,
changelog and relevant schemas when the interface changes. Keep changes scoped;
formatting-only changes should not obscure security or correctness fixes.

## Versioning

CLI flags, configuration keys, Action inputs/outputs, and report `schemaVersion`
are public interfaces. Breaking changes require a major release. Security hardening
may reject previously accepted unsafe input in a patch release. Schema versions
change independently when report consumers need a migration. Keep `package.json`
and `src/version.ts` synchronized. Follow [publishing](docs/publishing.md).

## Community

Be respectful. Explain technical disagreement with evidence. Avoid personal attacks,
harassment, and publishing private information. Contributions are accepted under
the project's MIT license; do not submit work you lack permission to license.
