import { MaintainerError } from './errors.js';

export type JsonSchema = Record<string, unknown>;
export interface Schema<T> {
  readonly json: JsonSchema;
  readonly optional?: boolean;
  parse(value: unknown, path?: string): T;
}
export type Infer<S> = S extends Schema<infer T> ? T : never;
type Shape = Record<string, Schema<unknown>>;
type FromShape<S extends Shape> = { [K in keyof S]: Infer<S[K]> };

function invalid(path: string, expected: string): never {
  // Never include input values: validation errors may involve credentials or hostile text.
  throw new MaintainerError('INVALID_DATA', `Invalid data at ${path}: expected ${expected}.`);
}

function make<T>(json: JsonSchema, check: (value: unknown, path: string) => T): Schema<T> {
  return { json, parse: (value, path = '$') => check(value, path) };
}

/** Deliberately limited schema vocabulary. The same schema validates locally and goes to OpenAI. */
export const s = {
  string(max = 20_000, min = 0): Schema<string> {
    return make({ type: 'string', maxLength: max, minLength: min }, (value, path) => {
      if (typeof value !== 'string' || value.length > max || value.length < min) return invalid(path, 'bounded string');
      return value;
    });
  },
  number(min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): Schema<number> {
    return make({ type: integer ? 'integer' : 'number', minimum: min, maximum: max }, (value, path) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) return invalid(path, 'bounded number');
      return value;
    });
  },
  boolean(): Schema<boolean> {
    return make({ type: 'boolean' }, (value, path) => typeof value === 'boolean' ? value : invalid(path, 'boolean'));
  },
  enum<const T extends readonly string[]>(values: T): Schema<T[number]> {
    return make({ type: 'string', enum: [...values] }, (value, path) => {
      if (typeof value !== 'string' || !values.includes(value)) return invalid(path, 'allowed enum value');
      return value as T[number];
    });
  },
  array<T>(item: Schema<T>, max = 100): Schema<T[]> {
    return make({ type: 'array', items: item.json, maxItems: max }, (value, path) => {
      if (!Array.isArray(value) || value.length > max) return invalid(path, 'bounded array');
      return value.map((entry: unknown, index) => item.parse(entry, `${path}[${index}]`));
    });
  },
  object<S extends Shape>(shape: S, strict = true): Schema<FromShape<S>> {
    return make({ type: 'object', properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.json])), required: Object.entries(shape).filter(([, v]) => !v.optional).map(([k]) => k), additionalProperties: !strict }, (value, path) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid(path, 'object');
      const record = value as Record<string, unknown>;
      if (strict && Object.keys(record).some((key) => !Object.hasOwn(shape, key))) return invalid(path, 'object without unknown keys');
      const result: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(shape)) {
        Object.defineProperty(result, key, { value: schema.parse(Object.hasOwn(record, key) ? record[key] : undefined, `${path}.${key}`), enumerable: true, writable: true, configurable: true });
      }
      return result as FromShape<S>;
    });
  },
  nullable<T>(schema: Schema<T>): Schema<T | null> {
    return make({ anyOf: [schema.json, { type: 'null' }] }, (value, path) => value === null ? null : schema.parse(value, path));
  },
  optional<T>(schema: Schema<T>, fallback: T): Schema<T> {
    return { json: schema.json, optional: true, parse: (value, path) => value === undefined ? structuredClone(fallback) : schema.parse(value, path) };
  },
  union<A, B>(left: Schema<A>, right: Schema<B>): Schema<A | B> {
    return make({ anyOf: [left.json, right.json] }, (value, path) => {
      try { return left.parse(value, path); } catch (error) {
        if (!(error instanceof MaintainerError) || error.code !== 'INVALID_DATA') throw error;
        return right.parse(value, path);
      }
    });
  },
};

export function parseJson<T>(text: string, schema: Schema<T>, model = false): T {
  try { return schema.parse(JSON.parse(text) as unknown); } catch (error) {
    if (model) throw new MaintainerError('MODEL_OUTPUT', 'The model did not return valid schema-conforming JSON. No comment was published.');
    if (error instanceof MaintainerError) throw error;
    throw new MaintainerError('INVALID_DATA', 'Invalid JSON document.');
  }
}
