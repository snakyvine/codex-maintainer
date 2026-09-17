#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { dirname, basename, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lstat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { Maintainer, type MaintainerOptions, type Execution } from '../app.js';
import { parseRepo } from '../github/types.js';
import { GitHubClient } from '../github/client.js';
import { OpenAIProvider } from '../codex/openai.js';
import { LocalSource, inferRepository } from '../analysis/source.js';
import { analyzeRepository } from '../analysis/context.js';
import { parseConfig } from '../core/config.js';
import { optionalFile, readBounded, writeInside, missingFile } from '../core/files.js';
import { positiveInteger, requireSecret, redact, redactData } from '../core/security.js';
import { createLogger } from '../core/logger.js';
import { MaintainerError, errorMessage } from '../core/errors.js';
import { runDemo } from '../demo/index.js';
import { VERSION } from '../version.js';

interface GlobalOptions { repo?: string; config?: string; model?: string; quiet?: boolean }
interface OutputOptions { format: string; output?: string; comment?: boolean }
interface AnalyzeOptions { root: string; output?: string }

async function configOverride(path?: string): Promise<unknown> {
  if (!path) return undefined;
  try { return JSON.parse(await readBounded(resolve(path), 32_000)) as unknown; }
  catch (error) { if (error instanceof MaintainerError) throw error; throw new MaintainerError('CONFIG', 'Cannot read a valid JSON configuration file.'); }
}
async function cachedContext(root: string): Promise<string | undefined> {
  try {
    const folder = await lstat(join(root, '.codex-maintainer'));
    if (folder.isSymbolicLink() || !folder.isDirectory()) throw new MaintainerError('UNSAFE', 'Context cache directory must not be a symlink.');
    return optionalFile(join(root, '.codex-maintainer/context.json'), 3_000_000);
  } catch (error) { if (missingFile(error)) return undefined; throw error; }
}
async function live(options: GlobalOptions, env: NodeJS.ProcessEnv, cwd: string, requireAI = true): Promise<Maintainer> {
  const token = requireSecret(env, 'GITHUB_TOKEN');
  const apiKey = requireAI ? requireSecret(env, 'OPENAI_API_KEY') : '';
  const rawRepo = options.repo ?? env['GITHUB_REPOSITORY'] ?? await inferRepository(cwd);
  if (!rawRepo) throw new MaintainerError('CONFIG', 'Supply --repo owner/name, set GITHUB_REPOSITORY, or run inside a GitHub checkout.');
  const secrets = [apiKey, token].filter(Boolean);
  const logger = createLogger(secrets, options.quiet);
  const github = new GitHubClient(parseRepo(rawRepo), token, { logger });
  const model = options.model ?? env['CODEX_MAINTAINER_MODEL'];
  const cache = await cachedContext(cwd);
  const settings: MaintainerOptions = { secrets, logger, ...(model ? { model } : {}), ...(cache ? { cache } : {}) };
  const config = await configOverride(options.config);
  if (config !== undefined) settings.config = config;
  return new Maintainer(github, (config) => new OpenAIProvider(config, apiKey, secrets, logger), settings);
}
async function emit(execution: Execution<unknown>, options: OutputOptions): Promise<void> {
  if (!['markdown', 'json'].includes(options.format)) throw new MaintainerError('CONFIG', '--format must be markdown or json.');
  const text = options.format === 'json' ? `${JSON.stringify(execution.report, null, 2)}\n` : execution.markdown;
  if (options.output) await writeInside(dirname(resolve(options.output)), basename(options.output), text);
  else process.stdout.write(text);
}
function outputOptions(command: Command, allowComment = false): Command {
  command.option('--format <format>', 'markdown or json', 'markdown').option('-o, --output <path>', 'write report to a file instead of stdout');
  if (allowComment) command.option('--comment', 'explicitly publish/update one recommendation comment (requires write permission)', false);
  return command;
}

export function createProgram(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Command {
  const program = new Command().name('codex-maintainer').description('Read-only, evidence-grounded GitHub maintenance.').version(VERSION)
    .option('--repo <owner/name>', 'GitHub.com repository; inferred from GITHUB_REPOSITORY or .git/config')
    .option('--config <path>', 'JSON configuration replacing repository settings')
    .option('--model <id>', 'OpenAI model with Responses API and Structured Outputs support')
    .option('--quiet', 'suppress informational logs').exitOverride();
  program.configureHelp({ showGlobalOptions: true });
  program.command('analyze').description('Inspect structure and write .codex-maintainer/context.json; no AI call')
    .option('--root <directory>', 'local repository directory (without --repo)', cwd)
    .option('-o, --output <path>', 'alternative JSON output path')
    .action(async (options: AnalyzeOptions) => {
      const global = program.opts<GlobalOptions>();
      let context;
      if (global.repo) context = await (await live(global, env, cwd, false)).analyze();
      else {
        const root = resolve(options.root);
        const localConfig = global.config ?? (await optionalFile(join(root, '.codex-maintainer.json'), 32_000) === undefined ? undefined : join(root, '.codex-maintainer.json'));
        const config = await configOverride(localConfig) ?? {};
        const parsed = parseConfig(config, global.model ?? env['CODEX_MAINTAINER_MODEL']);
        const source = await LocalSource.create(root, parsed.excludePaths);
        context = redactData(await analyzeRepository(source, parsed), [env['OPENAI_API_KEY'] ?? '', env['GITHUB_TOKEN'] ?? '']);
      }
      const target = options.output ? resolve(options.output) : resolve(options.root, '.codex-maintainer/context.json');
      const root = options.output ? dirname(target) : resolve(options.root);
      const relative = options.output ? basename(target) : '.codex-maintainer/context.json';
      await writeInside(root, relative, `${JSON.stringify(context, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify({ context: target, files: context.files.length, ref: context.ref })}\n`);
    });
  for (const task of ['triage', 'review'] as const) {
    outputOptions(program.command(task).description(task === 'triage' ? 'Suggest issue type, labels, files and investigation steps' : 'Review PR correctness using base-repository context and visible diff lines').argument('<number>', 'issue or PR number'), true)
      .action(async (raw: string, options: OutputOptions) => {
        const number = positiveInteger(raw);
        if (!['markdown', 'json'].includes(options.format)) throw new MaintainerError('CONFIG', '--format must be markdown or json.');
        const maintainer = await live(program.opts<GlobalOptions>(), env, cwd);
        const execution = task === 'triage' ? await maintainer.triage(number) : await maintainer.review(number);
        await emit(execution, options);
        if (options.comment) {
          const posted = await maintainer.comment(execution, await maintainer.github.currentUser());
          createLogger([], program.opts<GlobalOptions>().quiet).info(`Recommendation comment ${posted.id} published or unchanged.`);
        }
      });
  }
  outputOptions(program.command('release').description('Generate Markdown release notes from an ancestral commit range').argument('<version>', 'release heading; also target ref unless --to is supplied'))
    .option('--from <ref>', 'explicit previous tag or commit')
    .option('--to <ref>', 'target ref for an unpublished version')
    .action(async (version: string, options: OutputOptions & { from?: string; to?: string }) => {
      if (!['markdown', 'json'].includes(options.format)) throw new MaintainerError('CONFIG', '--format must be markdown or json.');
      const maintainer = await live(program.opts<GlobalOptions>(), env, cwd);
      await emit(await maintainer.release(version, options.from, options.to), options);
    });
  program.command('demo').description('Run a deterministic synthetic demo; no network, credentials or live AI')
    .option('--output-dir <directory>', 'write the fixture reports here', join(cwd, 'demo-output'))
    .action(async (options: { outputDir: string }) => {
      const directory = resolve(options.outputDir);
      const fixture = fileURLToPath(new URL('../../examples/demo-repository/fixtures.json', import.meta.url));
      await runDemo(fixture, directory);
      process.stdout.write(`Offline fixture reports written to ${directory}\n`);
    });
  return program;
}

export async function main(argv = process.argv): Promise<void> {
  try { await createProgram().parseAsync(argv); }
  catch (error) {
    if (error instanceof CommanderError) { process.exitCode = error.exitCode; return; }
    process.stderr.write(`${redact(errorMessage(error), [process.env['OPENAI_API_KEY'] ?? '', process.env['GITHUB_TOKEN'] ?? ''])}\n`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) void main();
