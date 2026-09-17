import { MaintainerError } from '../core/errors.js';
import { type Schema } from '../core/schema.js';
import { silentLogger, type Logger } from '../core/logger.js';

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface HttpOptions {
  fetch?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
  maxRequests?: number;
  retries?: number;
}

async function boundedJson(response: Response, limit = 8_000_000): Promise<unknown> {
  if (Number(response.headers.get('content-length') ?? 0) > limit) throw new MaintainerError('LIMIT', 'GitHub response exceeds the byte budget.');
  if (!response.body) throw new MaintainerError('GITHUB', 'GitHub returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new MaintainerError('LIMIT', 'GitHub response exceeds the byte budget.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new MaintainerError('GITHUB', 'GitHub returned invalid JSON.'); }
}

export function retryDelay(headers: Headers, attempt: number, now = Date.now()): number {
  const after = headers.get('retry-after');
  if (after !== null) {
    const seconds = /^\d+(?:\.\d+)?$/.test(after) ? Number(after) : (Date.parse(after) - now) / 1_000;
    if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1_000));
  }
  if (headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(headers.get('x-ratelimit-reset')) * 1_000 - now;
    if (Number.isFinite(reset) && reset > 0) return reset + 1_000;
  }
  return 500 * 2 ** attempt + Math.floor(Math.random() * 200);
}

/** Fixed-origin client: never fetch a URL or redirect supplied by an issue, PR or model. */
export class GitHubHttp {
  private readonly fetcher: Fetcher;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: Logger;
  private readonly maxRequests: number;
  private readonly retries: number;
  private requests = 0;
  constructor(private readonly token: string, options: HttpOptions = {}) {
    if (!token.trim() || /[\r\n\x00]/.test(token)) throw new MaintainerError('CONFIG', 'A valid GITHUB_TOKEN environment variable is required.');
    this.fetcher = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.logger = options.logger ?? silentLogger;
    this.maxRequests = options.maxRequests ?? 400;
    this.retries = options.retries ?? 2;
  }
  get requestCount(): number { return this.requests; }

  async request<T>(path: string, schema: Schema<T>, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || /[\r\n\\]/.test(path)) throw new MaintainerError('UNSAFE', 'Invalid GitHub API path.');
    for (let attempt = 0; ; attempt++) {
      if (++this.requests > this.maxRequests) throw new MaintainerError('LIMIT', 'GitHub request budget exhausted. Narrow the release range or lower context limits.');
      let response: Response;
      try {
        response = await this.fetcher(`https://api.github.com${path}`, {
          method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'codex-maintainer', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(30_000),
        });
      } catch {
        if (method === 'GET' && attempt < this.retries) { this.logger.warn('GitHub connection failed; retrying read request.'); await this.sleep(retryDelay(new Headers(), attempt)); continue; }
        throw new MaintainerError('NETWORK', method === 'GET' ? 'Cannot reach GitHub. Check connectivity and retry.' : 'GitHub write response was not received. Check the issue before retrying; the write may have succeeded.');
      }
      const rateLimited = response.status === 429 || (response.status === 403 && (response.headers.has('retry-after') || response.headers.get('x-ratelimit-remaining') === '0'));
      if (response.ok) {
        try { return schema.parse(await boundedJson(response)); }
        catch (error) {
          if (error instanceof MaintainerError) throw error;
          if (method === 'GET' && attempt < this.retries) { this.logger.warn('GitHub response body was interrupted; retrying read request.'); await this.sleep(retryDelay(new Headers(), attempt)); continue; }
          throw new MaintainerError('NETWORK', method === 'GET' ? 'GitHub response body was interrupted.' : 'GitHub write response was interrupted. Check the issue before retrying; the write may have succeeded.');
        }
      }
      await response.body?.cancel().catch(() => undefined);
      const retryable = rateLimited || response.status === 408 || response.status >= 500;
      const delay = retryDelay(response.headers, attempt);
      // Writes are not automatically retried: avoiding duplicate comments is more important than hiding a transient failure.
      if (method === 'GET' && retryable && attempt < this.retries && delay <= 30_000) {
        this.logger.warn(`GitHub returned ${response.status}; retrying a read request.`);
        await this.sleep(delay); continue;
      }
      if (rateLimited) throw new MaintainerError('RATE_LIMIT', `GitHub rate limit reached. Retry after at least ${Math.max(1, Math.ceil(delay / 1_000))} seconds.`, response.status);
      if (response.status === 401) throw new MaintainerError('AUTH', 'GitHub rejected GITHUB_TOKEN.', response.status);
      if (response.status === 403) throw new MaintainerError('AUTH', 'GitHub denied access. Check fine-grained repository permissions, organization approval, and secondary rate limits.', response.status);
      throw new MaintainerError('GITHUB', `GitHub returned HTTP ${response.status}. Check the repository, resource number or ref and token access.`, response.status);
    }
  }
}
