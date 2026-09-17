import { redact } from './security.js';
export const silentLogger = { info: () => undefined, warn: () => undefined };
export function createLogger(secrets = [], quiet = false) {
    const write = (level, message) => {
        if (!quiet)
            process.stderr.write(`${JSON.stringify({ level, message: redact(message, secrets) })}\n`);
    };
    return { info: (message) => write('info', message), warn: (message) => write('warn', message) };
}
//# sourceMappingURL=logger.js.map