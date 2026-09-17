import { type Schema } from '../core/schema.js';
import { type Logger } from '../core/logger.js';
export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface HttpOptions {
    fetch?: Fetcher;
    sleep?: (ms: number) => Promise<void>;
    logger?: Logger;
    maxRequests?: number;
    retries?: number;
}
export declare function retryDelay(headers: Headers, attempt: number, now?: number): number;
/** Fixed-origin client: never fetch a URL or redirect supplied by an issue, PR or model. */
export declare class GitHubHttp {
    private readonly token;
    private readonly fetcher;
    private readonly sleep;
    private readonly logger;
    private readonly maxRequests;
    private readonly retries;
    private requests;
    constructor(token: string, options?: HttpOptions);
    get requestCount(): number;
    request<T>(path: string, schema: Schema<T>, method?: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T>;
}
