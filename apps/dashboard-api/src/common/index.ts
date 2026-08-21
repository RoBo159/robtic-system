/**
 * Everything shared across more than one feature module.
 *
 * The bar for landing here is *used by two features*, not *looks reusable*. `common/` that collects
 * anything plausibly generic becomes a second home for feature code, and then every module depends
 * on all of it. Guards live in `auth/` for the same reason: `SessionGuard` and `GuildAccessGuard`
 * are authentication and authorization logic, not utilities that happen to be shaped like guards.
 *
 * Folders a Nest project often has and this one does not: `interceptors/`, `pipes/`, `middleware/`,
 * `types/`. Nothing needs them yet — the one pipe is `ValidationPipe`, registered globally in
 * `main.ts`, and cookie parsing is Express middleware applied there too. Empty folders would
 * describe an architecture this service does not have.
 */
export * from "./constants";
export * from "./decorators";
export * from "./dto";
export * from "./filters";
export * from "./interfaces";
export * from "./utils";
