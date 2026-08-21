/**
 * Reflector metadata keys.
 *
 * Namespaced strings rather than bare ones, so a key here cannot collide with metadata set by Nest
 * itself or by a library decorator on the same handler.
 */

/** Set by `@Public()`, read by `SessionGuard`. */
export const IS_PUBLIC_KEY = "dashboard:public";
