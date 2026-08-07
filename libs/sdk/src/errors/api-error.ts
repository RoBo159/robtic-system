import { API_ERROR_CODES, API_ERROR_STATUS, isRetryableCode, type ApiErrorCode } from "./error-codes";

/**
 * The single error type crossing the API boundary. Controllers throw it, the router serialises it,
 * and the SDK client re-throws it on the caller's side — so a consumer handles one shape whether
 * the failure happened locally or three services away.
 */
export class ApiError extends Error {
    readonly code: ApiErrorCode;
    readonly status: number;
    /** Field-level context for a validation failure; empty for every other code. */
    readonly details: Record<string, string>;

    constructor(code: ApiErrorCode, message: string, details: Record<string, string> = {}) {
        super(message);
        this.name = "ApiError";
        this.code = code;
        this.status = API_ERROR_STATUS[code];
        this.details = details;
    }

    /** True when retrying the identical request could plausibly succeed. */
    get retryable(): boolean {
        return isRetryableCode(this.code);
    }

    toJSON(): { code: ApiErrorCode; message: string; details?: Record<string, string> } {
        return Object.keys(this.details).length > 0
            ? { code: this.code, message: this.message, details: this.details }
            : { code: this.code, message: this.message };
    }

    static unauthorized(message = "A valid API key is required"): ApiError {
        return new ApiError(API_ERROR_CODES.unauthorized, message);
    }

    static forbidden(message = "This key may not act on that guild or server"): ApiError {
        return new ApiError(API_ERROR_CODES.forbidden, message);
    }

    static notFound(what: string): ApiError {
        return new ApiError(API_ERROR_CODES.notFound, `${what} was not found`);
    }

    static validation(details: Record<string, string>): ApiError {
        return new ApiError(API_ERROR_CODES.validationFailed, "The request body failed validation", details);
    }

    static rateLimited(retryAfterSeconds: number): ApiError {
        return new ApiError(API_ERROR_CODES.rateLimited, `Rate limit exceeded, retry in ${retryAfterSeconds}s`);
    }

    static conflict(message: string): ApiError {
        return new ApiError(API_ERROR_CODES.conflict, message);
    }

    static notLinked(): ApiError {
        return new ApiError(API_ERROR_CODES.notLinked, "That Minecraft account is not linked to Discord");
    }

    static insufficientFunds(): ApiError {
        return new ApiError(API_ERROR_CODES.insufficientFunds, "The balance is too low for that debit");
    }

    static upstream(message: string): ApiError {
        return new ApiError(API_ERROR_CODES.upstreamUnavailable, message);
    }

    static internal(message = "Internal server error"): ApiError {
        return new ApiError(API_ERROR_CODES.internal, message);
    }
}
