export interface Logger {
    info(message: string): void;
    warn(message: string): void;
}
export declare const silentLogger: Logger;
export declare function createLogger(secrets?: readonly string[], quiet?: boolean): Logger;
