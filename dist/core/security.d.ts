export declare function isSafePath(path: string): boolean;
export declare function includedPath(path: string, exclude?: readonly string[]): boolean;
export declare function cleanText(text: string): string;
export declare function redact(text: string, secrets?: readonly string[]): string;
/** Strip model-controlled Markdown features, HTML, mention notifications and terminal controls. */
export declare function safeMarkdown(text: string): string;
export declare function positiveInteger(raw: string): number;
export declare function requireSecret(env: NodeJS.ProcessEnv, name: 'OPENAI_API_KEY' | 'GITHUB_TOKEN'): string;
/** Sanitize every string in an already-validated JSON data object, including retained evidence. */
export declare function redactData<T>(value: T, secrets?: readonly string[]): T;
/** Redact source text without moving original line coordinates. */
export declare function redactSource(text: string, secrets?: readonly string[]): string;
