import { type Schema } from '../core/schema.js';
import { type Config } from '../core/config.js';
import { type Logger } from '../core/logger.js';
import { type AIProvider, type AIResult, type Task } from './provider.js';
/** Structural boundary keeps SDK-specific types out of the maintenance domain. */
export interface ResponsesClient {
    responses: {
        create(body: Record<string, unknown>, options?: {
            signal: AbortSignal;
        }): Promise<unknown>;
    };
}
export interface SdkOptions {
    apiKey: string;
    baseURL: string;
    maxRetries: number;
    timeout: number;
    logLevel: 'off';
}
export declare function createOfficialClient(apiKey: string): ResponsesClient;
export declare class OpenAIProvider implements AIProvider {
    private readonly config;
    private readonly secrets;
    private readonly logger;
    private readonly client;
    constructor(config: Config, apiKey: string, secrets?: readonly string[], logger?: Logger, client?: ResponsesClient);
    complete<T>(task: Task, schema: Schema<T>, evidence: unknown): Promise<AIResult<T>>;
}
