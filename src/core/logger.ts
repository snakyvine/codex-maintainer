import { redact } from './security.js';

export interface Logger { info(message: string): void; warn(message: string): void }
export const silentLogger: Logger = { info: () => undefined, warn: () => undefined };
export function createLogger(secrets: readonly string[] = [], quiet = false): Logger {
  const write = (level: string, message: string): void => {
    if (!quiet) process.stderr.write(`${JSON.stringify({ level, message: redact(message, secrets) })}\n`);
  };
  return { info: (message) => write('info', message), warn: (message) => write('warn', message) };
}
