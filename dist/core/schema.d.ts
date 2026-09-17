export type JsonSchema = Record<string, unknown>;
export interface Schema<T> {
    readonly json: JsonSchema;
    readonly optional?: boolean;
    parse(value: unknown, path?: string): T;
}
export type Infer<S> = S extends Schema<infer T> ? T : never;
type Shape = Record<string, Schema<unknown>>;
type FromShape<S extends Shape> = {
    [K in keyof S]: Infer<S[K]>;
};
/** Deliberately limited schema vocabulary. The same schema validates locally and goes to OpenAI. */
export declare const s: {
    string(max?: number, min?: number): Schema<string>;
    number(min?: number, max?: number, integer?: boolean): Schema<number>;
    boolean(): Schema<boolean>;
    enum<const T extends readonly string[]>(values: T): Schema<T[number]>;
    array<T>(item: Schema<T>, max?: number): Schema<T[]>;
    object<S extends Shape>(shape: S, strict?: boolean): Schema<FromShape<S>>;
    nullable<T>(schema: Schema<T>): Schema<T | null>;
    optional<T>(schema: Schema<T>, fallback: T): Schema<T>;
    union<A, B>(left: Schema<A>, right: Schema<B>): Schema<A | B>;
};
export declare function parseJson<T>(text: string, schema: Schema<T>, model?: boolean): T;
export {};
