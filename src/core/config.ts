import { s, type Infer } from './schema.js';
import { MaintainerError } from './errors.js';
import { isSafePath } from './security.js';

export const configSchema = s.object({
  model: s.optional(s.string(100, 1), 'gpt-5.3-codex'),
  maxFiles: s.optional(s.number(1, 200), 60),
  maxDiffChars: s.optional(s.number(1_000, 300_000), 90_000),
  maxFileBytes: s.optional(s.number(1_000, 100_000), 16_000),
  maxContextFiles: s.optional(s.number(1, 24), 8),
  maxContextChars: s.optional(s.number(2_000, 150_000), 48_000),
  maxOutputTokens: s.optional(s.number(1_000, 24_000), 6_000),
  maxCommits: s.optional(s.number(1, 500), 200),
  excludePaths: s.optional(s.array(s.string(200, 1), 50), []),
});
export type Config = Infer<typeof configSchema>;
export const defaultConfig: Config = configSchema.parse({});
export function parseConfig(value: unknown, modelOverride?: string): Config {
  const parsed = configSchema.parse(value);
  if (modelOverride) parsed.model = s.string(100, 1).parse(modelOverride);
  if (!/^[A-Za-z0-9._:-]+$/.test(parsed.model)) throw new MaintainerError('CONFIG', 'Invalid model identifier.');
  for (const path of parsed.excludePaths) if (!isSafePath(path.replace(/\/$/, '')) || /[*?\[\]{}]/.test(path)) throw new MaintainerError('CONFIG', 'excludePaths must be repository-relative files or directory prefixes, not globs.');
  return parsed;
}
