import { type AIProvider, type Task } from '../codex/provider.js';
import { type Fetcher } from '../github/http.js';
export interface DemoFixture {
    routes: Record<string, unknown>;
    responses: Record<Task, unknown>;
}
export declare function fixtureProvider(responses: Record<Task, unknown>): AIProvider;
export declare function fixtureFetch(routes: Record<string, unknown>): Fetcher;
export declare function readFixture(path: string): Promise<DemoFixture>;
export declare function runDemo(fixturePath: string, directory: string): Promise<void>;
