import { createHash } from 'node:crypto';
import { s, parseJson, type Infer } from '../core/schema.js';
import { type Config } from '../core/config.js';
import { includedPath, redact, redactSource } from '../core/security.js';
import { type RepositorySource } from './source.js';
import { type Logger, silentLogger } from '../core/logger.js';

const manifestSchema = s.object({ path: s.string(500), dependencies: s.array(s.string(200), 200), scripts: s.array(s.string(100), 50) });
export const contextSchema = s.object({
  schemaVersion: s.enum(['1']), repository: s.string(150), ref: s.string(100), generatedAt: s.string(100), fingerprint: s.string(64),
  files: s.array(s.string(500), 20_000), languages: s.array(s.object({ name: s.string(50), files: s.number() }), 50),
  manifests: s.array(manifestSchema, 24), frameworks: s.array(s.string(100), 100), testSetup: s.array(s.string(500), 100), ci: s.array(s.string(500), 100),
  importantModules: s.array(s.string(500), 30), limitations: s.array(s.string(2_000), 50),
});
export type RepositoryContext = Infer<typeof contextSchema>;
export interface EvidenceFile { path: string; content: string; truncated: boolean }
export interface Evidence { context: RepositoryContext; files: EvidenceFile[]; limitations: string[] }

const languages: Record<string, string> = { ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', py: 'Python', rs: 'Rust', go: 'Go', java: 'Java', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', cs: 'C#', cpp: 'C++', c: 'C', swift: 'Swift', vue: 'Vue', svelte: 'Svelte' };
const manifestPattern = /(?:^|\/)(?:package\.json|pyproject\.toml|requirements[^/]*\.txt|Cargo\.toml|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle(?:\.kts)?)$/;
const frameworkNames = new Set(['react', 'next', 'vue', 'svelte', 'express', 'fastify', 'nestjs', '@nestjs/core', 'vitest', 'jest', 'mocha', '@playwright/test', 'django', 'fastapi', 'flask', 'pytest', 'tokio', 'axum', 'actix-web', 'rails', 'spring-boot']);

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function parseManifest(path: string, text: string): Infer<typeof manifestSchema> {
  let dependencies: string[] = [];
  let scripts: string[] = [];
  if (path.endsWith('package.json') || path.endsWith('composer.json')) {
    try {
      const value = object(JSON.parse(text) as unknown);
      dependencies = ['dependencies', 'devDependencies', 'peerDependencies', 'require', 'require-dev'].flatMap((key) => Object.keys(object(value[key])));
      scripts = Object.keys(object(value['scripts']));
    } catch { /* Invalid manifests remain visible in the context as detected manifest paths. */ }
  } else {
    // Conservative dependency-name extraction only. No TOML/YAML execution or dynamic imports.
    dependencies = [...text.matchAll(/(?:^|\n)\s*["']?([A-Za-z][A-Za-z0-9_.\/-]{1,100})["']?\s*(?:=|>=|~=|\s+v\d)/g)].map((match) => match[1] ?? '');
    for (const name of frameworkNames) if (text.toLowerCase().includes(name)) dependencies.push(name);
  }
  return { path, dependencies: [...new Set(dependencies)].filter((name) => name.length <= 200).sort().slice(0, 200), scripts: scripts.filter((name) => name.length <= 100).sort().slice(0, 50) };
}

export function contextFingerprint(source: RepositorySource, config: Config): string {
  return createHash('sha256').update(JSON.stringify({ repo: source.repository, ref: source.ref, paths: source.files, exclude: config.excludePaths, maxFileBytes: config.maxFileBytes })).digest('hex');
}

export async function analyzeRepository(source: RepositorySource, config: Config, cached?: string, logger: Logger = silentLogger): Promise<RepositoryContext> {
  const fingerprint = contextFingerprint(source, config);
  if (cached) {
    try {
      const parsed = parseJson(cached, contextSchema);
      if (parsed.repository === source.repository && parsed.ref === source.ref && parsed.fingerprint === fingerprint) { logger.info('Reusing a validated, snapshot-matched repository context.'); return parsed; }
    } catch { logger.warn('Ignoring an invalid repository context cache.'); }
  }
  const files = source.files.filter((file) => includedPath(file.path, config.excludePaths)).map((file) => file.path).sort();
  const counts = new Map<string, number>();
  for (const path of files) { const language = languages[path.split('.').at(-1) ?? '']; if (language) counts.set(language, (counts.get(language) ?? 0) + 1); }
  const limitations = ['Framework detection is heuristic. Test commands were detected, not executed.'];
  if (source.truncated) limitations.push('Repository tree exceeded the API or local traversal limit; the index is partial.');
  const manifests: Infer<typeof manifestSchema>[] = [];
  const candidates = files.filter((path) => manifestPattern.test(path));
  for (const path of candidates.slice(0, 24)) {
    const content = await source.read(path, config.maxFileBytes);
    if (content === undefined) { limitations.push(`Manifest omitted by the byte/binary budget: ${path}`); manifests.push({ path, dependencies: [], scripts: [] }); }
    else manifests.push(parseManifest(path, redact(content)));
  }
  if (candidates.length > 24) limitations.push('Only the first 24 dependency manifests were inspected.');
  const testSetup = files.filter((path) => /(?:^|\/)(?:tests?|__tests__|spec)(?:\/|\.)|(?:\.test\.|\.spec\.|vitest\.config|jest\.config|pytest\.ini|tox\.ini|playwright\.config)/i.test(path));
  const ci = files.filter((path) => /^\.github\/workflows\/|^\.circleci\/|(?:^|\/)(?:\.gitlab-ci\.yml|Jenkinsfile|azure-pipelines\.yml)$/.test(path));
  return contextSchema.parse({ schemaVersion: '1', repository: source.repository, ref: source.ref, generatedAt: new Date().toISOString(), fingerprint, files,
    languages: [...counts].map(([name, count]) => ({ name, files: count })).sort((a, b) => b.files - a.files || a.name.localeCompare(b.name)), manifests,
    frameworks: [...new Set(manifests.flatMap((manifest) => manifest.dependencies).filter((name) => frameworkNames.has(name)))].sort().slice(0, 100),
    testSetup: testSetup.slice(0, 100), ci: ci.slice(0, 100),
    importantModules: files.filter((path) => /(?:^|\/)(?:index|main|app|server|client|cli|lib|mod)\.[^.]+$/.test(path) || /^(?:src|lib|app)\/[^/]+\.[^.]+$/.test(path)).slice(0, 30),
    limitations: limitations.slice(0, 50),
  });
}

function tokens(query: string): Set<string> {
  return new Set(query.toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length >= 3 && !['the', 'and', 'with', 'this', 'that', 'when', 'from', 'file', 'issue'].includes(token)).slice(0, 200));
}

export async function collectEvidence(source: RepositorySource, context: RepositoryContext, query: string, config: Config, preferred: readonly string[] = [], secrets: readonly string[] = []): Promise<Evidence> {
  const terms = tokens(query);
  const ranked = context.files.map((path) => {
    const lower = path.toLowerCase();
    let score = preferred.includes(path) ? 100 : 0;
    for (const term of terms) if (lower.includes(term)) score += 10;
    if (context.importantModules.includes(path)) score += 3;
    if (/^readme\./i.test(path) || manifestPattern.test(path)) score += 2;
    if (context.testSetup.includes(path)) score += 1;
    return { path, score };
  }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const files: EvidenceFile[] = [];
  const limitations: string[] = [];
  let remaining = config.maxContextChars;
  for (const { path } of ranked.slice(0, config.maxContextFiles * 3)) {
    if (files.length >= config.maxContextFiles || remaining < 200) break;
    if (!includedPath(path, config.excludePaths)) continue;
    const raw = await source.read(path, config.maxFileBytes);
    if (raw === undefined) { limitations.push(`No source excerpt for ${path}: oversized, binary, missing or not a regular file.`); continue; }
    const sanitized = redactSource(raw, secrets);
    const numbered = sanitized.split('\n').map((line, index) => `${index + 1}: ${line}`).join('\n');
    const content = numbered.slice(0, remaining);
    files.push({ path, content, truncated: content.length < numbered.length });
    remaining -= content.length;
  }
  if (files.length === 0) limitations.push('No readable source excerpts were available; repository-level suggestions have limited evidence.');
  // Bound the path index independently; never dump an entire large repository into a prompt.
  const visible = { ...context, files: ranked.slice(0, 400).map((entry) => entry.path) };
  if (context.files.length > visible.files.length) limitations.push('The prompt includes only the 400 highest-ranked repository paths.');
  return { context: visible, files, limitations: limitations.slice(0, 50) };
}
