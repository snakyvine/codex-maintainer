import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const issues = [];
async function walk(dir) {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) paths.push(...await walk(join(dir, entry.name)));
    else paths.push(join(dir, entry.name));
  }
  return paths;
}
const configuration = ts.readConfigFile('tsconfig.test.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(configuration.config, ts.sys, '.');
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
for (const file of await walk('src')) {
  if (!file.endsWith('.ts')) continue;
  const text = await readFile(file, 'utf8');
  const source = program.getSourceFile(file);
  if (!source) { issues.push(`${file}: file missing from TypeScript program`); continue; }
  const report = (node, message) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    issues.push(`${file}:${line + 1}: ${message}`);
  };
  if (/@ts-(?:ignore|nocheck)/.test(text)) issues.push(`${file}: TypeScript suppression is not allowed`);
  if (/^.*[ \t]+$/m.test(text)) issues.push(`${file}: trailing whitespace`);
  if (!text.endsWith('\n')) issues.push(`${file}: missing final newline`);
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) report(node, 'explicit any bypasses the untrusted-data boundary');
    if (node.kind === ts.SyntaxKind.DebuggerStatement) report(node, 'debugger statement');
    if (ts.isNonNullExpression(node)) report(node, 'unchecked non-null assertion');
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /^(?:node:)?(?:child_process|vm|worker_threads)$/.test(node.moduleSpecifier.text)) report(node, 'repository runtime must not execute code or commands');
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (name === 'eval' || name === 'Function' || name.startsWith('console.')) report(node, 'use the redacting logger; dynamic execution is forbidden');
    }
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'Function') report(node, 'dynamic execution is forbidden');
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const type = checker.getTypeAtLocation(node.expression);
      if (type.getProperty('then')) report(node, 'promise must be awaited, returned, or explicitly handled with void');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
for (const file of await walk('scripts')) {
  if (!file.endsWith('.mjs')) continue;
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) issues.push(`${file}: invalid JavaScript syntax\n${checked.stderr}`);
}
if (issues.length) { process.stderr.write(`${issues.join('\n')}\n`); process.exitCode = 1; }
else process.stdout.write('Lint passed: TypeScript AST safety rules, floating promises, whitespace and script syntax.\n');
