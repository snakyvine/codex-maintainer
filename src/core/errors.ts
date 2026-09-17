export type ErrorCode = 'CONFIG' | 'AUTH' | 'NETWORK' | 'RATE_LIMIT' | 'GITHUB' | 'INVALID_DATA' | 'MODEL_OUTPUT' | 'REFUSAL' | 'INCOMPLETE' | 'STALE' | 'LIMIT' | 'UNSAFE' | 'SDK_MISSING';

export class MaintainerError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = 'MaintainerError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof MaintainerError ? `${error.code}: ${error.message}` : 'Unexpected failure. No repository changes were requested. Run the offline tests and report the failing command (without secrets).';
}

export function assert(condition: unknown, message: string, code: ErrorCode = 'INVALID_DATA'): asserts condition {
  if (!condition) throw new MaintainerError(code, message);
}
