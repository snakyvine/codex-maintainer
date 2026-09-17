import { type AIResult, type Task, type Usage } from '../codex/provider.js';
export interface Report<T> {
    schemaVersion: '1';
    task: Task;
    repository: string;
    target: string;
    sourceRef: string;
    headRef: string | null;
    generatedAt: string;
    provider: 'openai' | 'fixture';
    model: string;
    usage: Usage | null;
    requestId: string | null;
    warnings: string[];
    data: T;
}
export declare function report<T>(task: Task, repository: string, target: string, sourceRef: string, result: AIResult<T>, warnings?: string[], headRef?: string | null): Report<T>;
