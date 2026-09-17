import { MaintainerError } from './errors.js';
function invalid(path, expected) {
    // Never include input values: validation errors may involve credentials or hostile text.
    throw new MaintainerError('INVALID_DATA', `Invalid data at ${path}: expected ${expected}.`);
}
function make(json, check) {
    return { json, parse: (value, path = '$') => check(value, path) };
}
/** Deliberately limited schema vocabulary. The same schema validates locally and goes to OpenAI. */
export const s = {
    string(max = 20_000, min = 0) {
        return make({ type: 'string', maxLength: max, minLength: min }, (value, path) => {
            if (typeof value !== 'string' || value.length > max || value.length < min)
                return invalid(path, 'bounded string');
            return value;
        });
    },
    number(min = 0, max = Number.MAX_SAFE_INTEGER, integer = true) {
        return make({ type: integer ? 'integer' : 'number', minimum: min, maximum: max }, (value, path) => {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value)))
                return invalid(path, 'bounded number');
            return value;
        });
    },
    boolean() {
        return make({ type: 'boolean' }, (value, path) => typeof value === 'boolean' ? value : invalid(path, 'boolean'));
    },
    enum(values) {
        return make({ type: 'string', enum: [...values] }, (value, path) => {
            if (typeof value !== 'string' || !values.includes(value))
                return invalid(path, 'allowed enum value');
            return value;
        });
    },
    array(item, max = 100) {
        return make({ type: 'array', items: item.json, maxItems: max }, (value, path) => {
            if (!Array.isArray(value) || value.length > max)
                return invalid(path, 'bounded array');
            return value.map((entry, index) => item.parse(entry, `${path}[${index}]`));
        });
    },
    object(shape, strict = true) {
        return make({ type: 'object', properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.json])), required: Object.entries(shape).filter(([, v]) => !v.optional).map(([k]) => k), additionalProperties: !strict }, (value, path) => {
            if (typeof value !== 'object' || value === null || Array.isArray(value))
                return invalid(path, 'object');
            const record = value;
            if (strict && Object.keys(record).some((key) => !Object.hasOwn(shape, key)))
                return invalid(path, 'object without unknown keys');
            const result = {};
            for (const [key, schema] of Object.entries(shape)) {
                Object.defineProperty(result, key, { value: schema.parse(Object.hasOwn(record, key) ? record[key] : undefined, `${path}.${key}`), enumerable: true, writable: true, configurable: true });
            }
            return result;
        });
    },
    nullable(schema) {
        return make({ anyOf: [schema.json, { type: 'null' }] }, (value, path) => value === null ? null : schema.parse(value, path));
    },
    optional(schema, fallback) {
        return { json: schema.json, optional: true, parse: (value, path) => value === undefined ? structuredClone(fallback) : schema.parse(value, path) };
    },
    union(left, right) {
        return make({ anyOf: [left.json, right.json] }, (value, path) => {
            try {
                return left.parse(value, path);
            }
            catch (error) {
                if (!(error instanceof MaintainerError) || error.code !== 'INVALID_DATA')
                    throw error;
                return right.parse(value, path);
            }
        });
    },
};
export function parseJson(text, schema, model = false) {
    try {
        return schema.parse(JSON.parse(text));
    }
    catch (error) {
        if (model)
            throw new MaintainerError('MODEL_OUTPUT', 'The model did not return valid schema-conforming JSON. No comment was published.');
        if (error instanceof MaintainerError)
            throw error;
        throw new MaintainerError('INVALID_DATA', 'Invalid JSON document.');
    }
}
//# sourceMappingURL=schema.js.map