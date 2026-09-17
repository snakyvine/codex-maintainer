import { readFixture, fixtureProvider, fixtureFetch, type DemoFixture } from '../src/demo/index.js';
import { GitHubClient } from '../src/github/client.js';
import { parseRepo } from '../src/github/types.js';
import { Maintainer } from '../src/app.js';
import { MaintainerError } from '../src/core/errors.js';
import { resolve } from 'node:path';
export const fixturePath = resolve('examples/demo-repository/fixtures.json');
export const repo = parseRepo('demo/pagination');
export const base = '1'.repeat(40), head = '2'.repeat(40), previous = '0'.repeat(40);
export async function fixture(): Promise<DemoFixture> { return readFixture(fixturePath); }
export async function app(): Promise<{ data: DemoFixture; github: GitHubClient; maintainer: Maintainer }> {
  const data = await fixture();
  const github = new GitHubClient(repo, 'unit-test-token', { fetch: fixtureFetch(data.routes), retries: 0 });
  return { data, github, maintainer: new Maintainer(github, () => fixtureProvider(data.responses)) };
}
export const code = (expected: string) => (error: unknown): boolean => error instanceof MaintainerError && error.code === expected;
