# Third-party notices

Codex Maintainer's original source is MIT licensed. Dependencies are installed
separately by npm, not copied into `dist/` or redistributed in the source archive.
Their licenses remain applicable to those packages.

| Dependency | Role | License |
| --- | --- | --- |
| OpenAI JavaScript SDK (`openai`) | Responses API transport | Apache-2.0 |
| Commander (`commander`) | CLI parsing | MIT |
| TypeScript | Development-time compiler and lint analysis | Apache-2.0 |
| `@types/node` and `undici-types` | Development-time type definitions | MIT |

See each installed package's license for its copyright and terms. The GitHub
Actions used by workflows have their own licenses. A future bundled Action must
include the licenses and notices for every bundled dependency; this distribution
is deliberately not a dependency bundle.
