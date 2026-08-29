package org.robtic.core.api;

import java.util.Set;

/**
 * A failed Robtic API call, carrying the machine-readable code the API returned.
 *
 * The code is what decides whether the request is worth keeping: a validation failure would fail
 * identically forever and is discarded, while an unreachable API is queued and replayed. Callers
 * therefore branch on {@link #isRetryable()} rather than on the message text.
 */
public final class ApiException extends RuntimeException {

    /** Mirrors RETRYABLE_ERROR_CODES in libs/sdk — the two lists must agree. */
    private static final Set<String> RETRYABLE = Set.of(
            "RATE_LIMITED",
            "UPSTREAM_UNAVAILABLE",
            "INTERNAL_ERROR",
            // Raised locally when the socket never connected, which is the offline case.
            "NETWORK_UNREACHABLE"
    );

    private final String code;
    private final int status;

    public ApiException(String code, int status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public ApiException(String code, int status, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.status = status;
    }

    public String code() {
        return code;
    }

    public int status() {
        return status;
    }

    public boolean isRetryable() {
        return RETRYABLE.contains(code);
    }

    /** True when the key itself is the problem, which is worth telling staff about in game. */
    public boolean isAuthFailure() {
        return "UNAUTHORIZED".equals(code) || "FORBIDDEN".equals(code);
    }
}
