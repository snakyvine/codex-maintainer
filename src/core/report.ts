import { type AIResult, type Task, type Usage } from '../codex/provider.js';
export interface Report<T> {
  schemaVersion: '1'; task: Task; repository: string; target: string; sourceRef: string; headRef: string | null;
  generatedAt: string; provider: 'openai' | 'fixture'; model: string; usage: Usage | null; requestId: string | null;
  warnings: string[]; data: T;
}
export function report<T>(task: Task, repository: string, target: string, sourceRef: string, result: AIResult<T>, warnings: string[] = [], headRef: string | null = null): Report<T> {
  return { schemaVersion: '1', task, repository, target, sourceRef, headRef, generatedAt: new Date().toISOString(),
    provider: result.provider, model: result.model, usage: result.usage, requestId: result.requestId, warnings: [...new Set(warnings)], data: result.value };
}
