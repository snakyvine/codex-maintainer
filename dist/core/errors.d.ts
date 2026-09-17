export type ErrorCode = 'CONFIG' | 'AUTH' | 'NETWORK' | 'RATE_LIMIT' | 'GITHUB' | 'INVALID_DATA' | 'MODEL_OUTPUT' | 'REFUSAL' | 'INCOMPLETE' | 'STALE' | 'LIMIT' | 'UNSAFE' | 'SDK_MISSING';
export declare class MaintainerError extends Error {
    readonly code: ErrorCode;
    readonly status?: number | undefined;
    constructor(code: ErrorCode, message: string, status?: number | undefined);
}
export declare function errorMessage(error: unknown): string;
export declare function assert(condition: unknown, message: string, code?: ErrorCode): asserts condition;
