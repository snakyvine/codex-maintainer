# Security policy

Codex Maintainer handles untrusted repository content and can send selected code
to OpenAI. Read [the threat model](docs/security.md) before giving it a token.
This tool is not a security scanner or a substitute for human review.

## Reporting a vulnerability

On a published GitHub repository, use **Security -> Report a vulnerability** when
private reporting is enabled. The publisher must enable private vulnerability
reporting before inviting production use. Do not open a public issue containing
credentials, private source, exploit payloads against a live system, or sensitive
repository metadata. When private reporting is not yet available, open an issue
requesting a private contact channel without disclosing vulnerability details.

Include the affected version/commit, a minimal synthetic reproduction, the trust
boundary crossed, expected versus observed behavior, and any proposed mitigation.
Do not probe repositories or accounts you do not control.

## Supported versions

The initial source distribution is pre-release. Once 1.x is published, security
fixes will target the latest 1.x release; no older release has a support guarantee.
There is no contractual response-time or availability commitment.

## Operating safely

Use repository-scoped, least-privilege credentials; rotate any exposed key at its
issuer. Use summary-only mode first, pin the Action to a reviewed commit, and use
fresh ephemeral runners. Do not run a secret-bearing job after executing untrusted
code in the same runner. Never work around fork secret restrictions with a broad
PAT or by checking out the PR head under `pull_request_target`.

A finding's valid file/line/quote is evidence of a location, not proof that the
claimed bug exists. Prompt instructions are not a complete injection defense.
The hard boundary is that the model has no execution or write tools, writes need
explicit caller opt-in, and all output is treated as untrusted data.
