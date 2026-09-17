export class MaintainerError extends Error {
    code;
    status;
    constructor(code, message, status) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'MaintainerError';
    }
}
export function errorMessage(error) {
    return error instanceof MaintainerError ? `${error.code}: ${error.message}` : 'Unexpected failure. No repository changes were requested. Run the offline tests and report the failing command (without secrets).';
}
export function assert(condition, message, code = 'INVALID_DATA') {
    if (!condition)
        throw new MaintainerError(code, message);
}
//# sourceMappingURL=errors.js.map