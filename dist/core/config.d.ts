import { type Infer } from './schema.js';
export declare const configSchema: import("./schema.js").Schema<{
    model: string;
    maxFiles: number;
    maxDiffChars: number;
    maxFileBytes: number;
    maxContextFiles: number;
    maxContextChars: number;
    maxOutputTokens: number;
    maxCommits: number;
    excludePaths: string[];
}>;
export type Config = Infer<typeof configSchema>;
export declare const defaultConfig: Config;
export declare function parseConfig(value: unknown, modelOverride?: string): Config;
