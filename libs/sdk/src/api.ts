/**
 * Server-safe entry point: the Robtic API contract only.
 *
 * `index.ts` additionally re-exports the Discord Embedded App layer, which pulls in a
 * browser-only dependency. Server applications — `apps/robtic-api`, `apps/bot`, `apps/api` —
 * import from here (the `@sdk` alias) so that dependency never reaches a Bun process.
 */

// Errors
export { ApiError } from "./errors/api-error";
export {
    API_ERROR_CODES,
    API_ERROR_STATUS,
    RETRYABLE_ERROR_CODES,
    isRetryableCode,
    type ApiErrorCode,
} from "./errors/error-codes";

// Constants
export { API_ROUTES } from "./constants/api-routes";
export {
    API_CACHE_TTL_MS,
    API_HEADERS,
    API_IDEMPOTENCY_TTL_MS,
    API_QUEUE,
    API_RATE_LIMIT,
    API_RETRY,
} from "./constants/api-limits";
export {
    STAFF_ACTIONS,
    STAFF_ACTION_SEVERITY,
    STAFF_ACTION_STAT,
    STAFF_STAT_KEYS,
    type StaffAction,
    type StaffStatKey,
} from "./constants/staff-actions";

// Auth
export {
    API_SCOPES,
    PLUGIN_DEFAULT_SCOPES,
    extractBearerToken,
    generateApiKey,
    hasScope,
    hashApiKey,
    type ApiKeyIdentity,
    type ApiScope,
} from "./auth/api-key";

// Validation
export { v, validateBody, type Validator } from "./validation/validator";
export {
    ITEM_KEY_PATTERN,
    SERVER_ID_PATTERN,
    SNOWFLAKE_PATTERN,
    USERNAME_PATTERN,
    UUID_PATTERN,
    normaliseUuid,
    schema,
} from "./validation/schemas";

// Transport
export { HttpClient, type HttpClientOptions, type RequestOptions } from "./api-client/http-client";
export { RobticApiClient } from "./api-client/robtic-api-client";

// Utilities
export { deterministicRequestId, newRequestId } from "./utils/request-id";
export { formatDuration, parseDuration } from "./utils/format-duration";

// Data transfer objects
export type * from "./dto/common";
export type * from "./dto/minecraft";
export type * from "./dto/economy";
export type * from "./dto/staff";
export type * from "./dto/discord";
export type * from "./dto/server";
