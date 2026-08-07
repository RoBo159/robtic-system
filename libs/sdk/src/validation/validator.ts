import { ApiError } from "../errors/api-error";

/**
 * A tiny structural validator.
 *
 * The project has no schema library and adding one for this would pull a dependency into every
 * consumer of the SDK, including the browser-side activity. These combinators cover what the API
 * actually needs — presence, type, range, enum, shape — and produce the field-keyed `details` map
 * {@link ApiError.validation} expects.
 */
export type Validator<T> = (value: unknown, field: string, errors: Record<string, string>) => T;

function fail(errors: Record<string, string>, field: string, message: string): void {
    if (!errors[field]) errors[field] = message;
}

export const v = {
    string(options: { min?: number; max?: number; pattern?: RegExp; trim?: boolean } = {}): Validator<string> {
        return (value, field, errors) => {
            if (typeof value !== "string") {
                fail(errors, field, "must be a string");
                return "";
            }
            const text = options.trim === false ? value : value.trim();
            if (options.min !== undefined && text.length < options.min) {
                fail(errors, field, `must be at least ${options.min} characters`);
            }
            if (options.max !== undefined && text.length > options.max) {
                fail(errors, field, `must be at most ${options.max} characters`);
            }
            if (options.pattern && !options.pattern.test(text)) {
                fail(errors, field, "is malformed");
            }
            return text;
        };
    },

    number(options: { min?: number; max?: number; integer?: boolean } = {}): Validator<number> {
        return (value, field, errors) => {
            const parsed = typeof value === "string" ? Number(value) : value;
            if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
                fail(errors, field, "must be a number");
                return 0;
            }
            if (options.integer && !Number.isInteger(parsed)) {
                fail(errors, field, "must be a whole number");
            }
            if (options.min !== undefined && parsed < options.min) {
                fail(errors, field, `must be at least ${options.min}`);
            }
            if (options.max !== undefined && parsed > options.max) {
                fail(errors, field, `must be at most ${options.max}`);
            }
            return parsed;
        };
    },

    boolean(): Validator<boolean> {
        return (value, field, errors) => {
            if (typeof value === "boolean") return value;
            if (value === "true") return true;
            if (value === "false") return false;
            fail(errors, field, "must be a boolean");
            return false;
        };
    },

    oneOf<const T extends readonly string[]>(allowed: T): Validator<T[number]> {
        return (value, field, errors) => {
            if (typeof value !== "string" || !allowed.includes(value)) {
                fail(errors, field, `must be one of: ${allowed.join(", ")}`);
                return allowed[0] as T[number];
            }
            return value as T[number];
        };
    },

    arrayOf<T>(item: Validator<T>, options: { min?: number; max?: number } = {}): Validator<T[]> {
        return (value, field, errors) => {
            if (!Array.isArray(value)) {
                fail(errors, field, "must be an array");
                return [];
            }
            if (options.min !== undefined && value.length < options.min) {
                fail(errors, field, `must contain at least ${options.min} entries`);
            }
            if (options.max !== undefined && value.length > options.max) {
                fail(errors, field, `must contain at most ${options.max} entries`);
            }
            return value.map((entry, index) => item(entry, `${field}[${index}]`, errors));
        };
    },

    object<S extends Record<string, Validator<unknown>>>(
        shape: S,
    ): Validator<{ [K in keyof S]: S[K] extends Validator<infer R> ? R : never }> {
        return (value, field, errors) => {
            if (typeof value !== "object" || value === null) {
                fail(errors, field, "must be an object");
                return {} as never;
            }
            const source = value as Record<string, unknown>;
            const result: Record<string, unknown> = {};
            for (const [key, validator] of Object.entries(shape)) {
                result[key] = validator(source[key], field ? `${field}.${key}` : key, errors);
            }
            return result as never;
        };
    },

    /** Wraps a validator so `undefined` and `null` pass through untouched. */
    optional<T>(inner: Validator<T>): Validator<T | undefined> {
        return (value, field, errors) => {
            if (value === undefined || value === null) return undefined;
            return inner(value, field, errors);
        };
    },

    /** Wraps a validator with a fallback used when the field is absent. */
    withDefault<T>(inner: Validator<T>, fallback: T): Validator<T> {
        return (value, field, errors) => {
            if (value === undefined || value === null) return fallback;
            return inner(value, field, errors);
        };
    },
};

/**
 * Runs a shape against a parsed body and throws a single {@link ApiError} listing every offending
 * field. Collecting all failures rather than stopping at the first is what makes a bad plugin
 * config fixable in one pass instead of one restart per typo.
 */
export function validateBody<S extends Record<string, Validator<unknown>>>(
    body: unknown,
    shape: S,
): { [K in keyof S]: S[K] extends Validator<infer R> ? R : never } {
    const errors: Record<string, string> = {};
    const result = v.object(shape)(body, "", errors);
    if (Object.keys(errors).length > 0) throw ApiError.validation(errors);
    return result;
}
