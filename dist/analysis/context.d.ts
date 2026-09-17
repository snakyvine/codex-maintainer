import { type Infer } from '../core/schema.js';
import { type Config } from '../core/config.js';
import { type RepositorySource } from './source.js';
import { type Logger } from '../core/logger.js';
export declare const contextSchema: import("../core/schema.js").Schema<{
    schemaVersion: "1";
    repository: string;
    ref: string;
    generatedAt: string;
    fingerprint: string;
    files: string[];
    languages: {
        name: string;
        files: number;
    }[];
    manifests: {
        path: string;
        dependencies: string[];
        scripts: string[];
    }[];
    frameworks: string[];
    testSetup: string[];
    ci: string[];
    importantModules: string[];
    limitations: string[];
}>;
export type RepositoryContext = Infer<typeof contextSchema>;
export interface EvidenceFile {
    path: string;
    content: string;
    truncated: boolean;
}
export interface Evidence {
    context: RepositoryContext;
    files: EvidenceFile[];
    limitations: string[];
}
export declare function contextFingerprint(source: RepositorySource, config: Config): string;
export declare function analyzeRepository(source: RepositorySource, config: Config, cached?: string, logger?: Logger): Promise<RepositoryContext>;
export declare function collectEvidence(source: RepositorySource, context: RepositoryContext, query: string, config: Config, preferred?: readonly string[], secrets?: readonly string[]): Promise<Evidence>;
