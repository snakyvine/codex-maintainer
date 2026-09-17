export declare function readBounded(path: string, limit?: number): Promise<string>;
export declare function missingFile(error: unknown): boolean;
export declare function optionalFile(path: string, limit?: number): Promise<string | undefined>;
/** Local cache/demo writes never follow a repository-controlled symlink. */
export declare function writeInside(root: string, relative: string, text: string): Promise<string>;
