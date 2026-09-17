# Publishing the CLI and GitHub Action

This source archive does not create a GitHub repository, reserve an npm name, publish
a package, create a release, or make the Action available in the Marketplace. The
publisher controls those decisions and credentials.

## First-release gates

On a network-enabled development machine, run from the source root:

```bash
npm install --ignore-scripts
npm run check
npm run test:sdk
npm run audit:release
npm audit --omit=dev
```

The first command generates `package-lock.json` from the actual npm registry;
review and commit it. `audit:release` deliberately refuses a missing lockfile or a
lockfile without registry integrity records for runtime dependencies. The initial
authoring environment could not resolve npm and therefore cannot supply or validate
that lockfile. Do not fabricate integrity hashes or treat the source-only fallback
install as a reproducible release.

After the initial install, also test a clean `npm ci --ignore-scripts` in a fresh
checkout. Confirm all checks on both configured CI Node versions. The SDK contract
uses real SDK serialization with a stub HTTP transport; it does not validate account
access, model quality, cost or live GitHub permissions.

Create a small disposable repository you control with one issue and one PR. Set
keys in your shell and run `analyze`, `triage`, `review`, and an explicit release
range. Start without `--comment`; inspect JSON and Markdown. Only then test explicit
comment creation, rerun/update behavior, stale-head rejection and the read-only
Action. Confirm ordinary fork and missing-secret runs skip without a paid call.
Do not use this smoke test to send private data without permission.

Enable private vulnerability reporting and branch protection on the public project.
Review Actions dependency pins and the dependency audit results. Replace the source
handoff's verification record with the actual clean-install and hosted-run results,
without upgrading fixture tests into live-validation claims.

## Publish a GitHub repository

Create an empty repository named `codex-maintainer` under your owner. Using your own
Git identity, from the extracted source directory:

```bash
git init -b main
git add .
git commit -m "feat: initial Codex Maintainer release"
git remote add origin git@github.com:YOUR_OWNER/codex-maintainer.git
git push -u origin main
```

Replace `YOUR_OWNER`; do not paste it literally. `dist/` is intentionally tracked.
Do not commit `node_modules`, test-build output, credentials or local caches. The
supplied CI workflow uses only a read token and no OpenAI secret.

The source package starts at `1.0.0` but is marked unreleased in the changelog.
Before tagging, keep `package.json` and `src/version.ts` synchronized, date the
changelog entry, run the release gates again, and commit the reviewed lockfile and
fresh `dist/` output. Then publish tags from the validated commit:

```bash
git tag -a v1.0.0 -m "Codex Maintainer 1.0.0"
git tag -a v1 -m "Codex Maintainer v1"
git push origin v1.0.0 v1
```

Create a GitHub Release from `v1.0.0`, describe limitations and checks, and optionally
complete GitHub's Marketplace listing flow for Actions. A public repository with
`action.yml` and a tag can be referenced by other workflows; a Marketplace listing
is not the runtime entry point. Consumers use:

```yaml
- uses: YOUR_OWNER/codex-maintainer@v1
  with:
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    github-token: ${{ github.token }}
```

Use a full commit SHA for immutable consumer pinning. Keep `v1.0.0` immutable.
Subsequent compatible releases may advance the moving `v1` tag according to your
published release policy. Do not force-update an immutable version tag or bypass
repository tag protections. Immutable GitHub Release settings may constrain a
moving-tag strategy; choose and document that policy before the first release.

## Optional npm publication

The unscoped package name has not been reserved or checked for ownership. Confirm
ownership, or rename it to your scope before publishing; the CLI bin name may remain
`codex-maintainer`. Add the real repository URL, issue tracker URL and publisher
metadata to `package.json` after the repository exists. There are no fake URLs or
publisher identities in the handoff.

```bash
npm run check
npm run test:sdk
npm run audit:release
npm pack --ignore-scripts
```

Inspect the tarball: it must contain `dist/cli/index.js`, the demo fixtures and
licenses, and must not contain `.env` or private data. Test installation of that
local tarball in a fresh directory with credentials unset. Then follow your npm
account's authenticated publishing process, preferably with trusted publishing.
The committed `.npmrc` disables lifecycle scripts by default; run the explicit
checks above rather than relying only on `prepublishOnly` as an enforcement boundary.

## Rollout

Use summary-only mode in one repository first. Review coverage and false positives
before enabling comments. Restrict the API key's project access and spending at
its issuer. Expose external-issue automation only after accepting its abuse/cost
profile. Announce actual behavior and measured evaluations, not invented adoption,
contributors, stars or benchmarks.
