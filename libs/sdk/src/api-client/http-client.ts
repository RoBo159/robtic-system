import { ApiError } from "../errors/api-error";
import { API_ERROR_CODES } from "../errors/error-codes";
import { API_HEADERS, API_RETRY } from "../constants/api-limits";
import type { ApiEnvelope } from "../dto/common";

export interface HttpClientOptions {
    /** Base URL of the Robtic API, without a trailing slash. */
    baseUrl: string;
    /** Bearer key. Read through a getter so a rotation takes effect without rebuilding the client. */
    apiKey: string | (() => string);
    /** Identity headers stamped onto every request. */
    serverId?: string;
    serverName?: string;
    clientVersion?: string;
    /** Per-request timeout. */
    timeoutMs?: number;
    /** Overridable for tests. */
    fetchImpl?: typeof fetch;
}

export interface RequestOptions {
    /** Idempotency key sent as `x-robtic-request-id`. */
    requestId?: string;
    /** Disables the retry loop for a call the caller wants to fail fast. */
    noRetry?: boolean;
    signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Exponential backoff with full jitter, so a fleet of servers does not retry in lockstep. */
function backoffDelay(attempt: number): number {
    const ceiling = Math.min(API_RETRY.baseDelayMs * API_RETRY.factor ** attempt, API_RETRY.maxDelayMs);
    return Math.random() * ceiling;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Transport for the Robtic API: auth headers, envelope unwrapping, and retry of transient
 * failures. Every consumer goes through this, which is what stops request logic being reinvented
 * in the bot, the dashboard and any future client.
 */
export class HttpClient {
    private readonly baseUrl: string;
    private readonly resolveKey: () => string;
    private readonly options: HttpClientOptions;
    private readonly fetchImpl: typeof fetch;

    constructor(options: HttpClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.resolveKey = typeof options.apiKey === "function" ? options.apiKey : () => options.apiKey as string;
        this.options = options;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    get<T>(path: string, query?: Record<string, string | number | undefined>, options?: RequestOptions): Promise<T> {
        const search = query
            ? Object.entries(query)
                  .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
                  .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
                  .join("&")
            : "";
        return this.send<T>("GET", search ? `${path}?${search}` : path, undefined, options);
    }

    post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
        return this.send<T>("POST", path, body, options);
    }

    private async send<T>(method: string, path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
        const attempts = options.noRetry ? 1 : API_RETRY.maxAttempts;
        let lastError: ApiError = ApiError.upstream("The request was never attempted");

        for (let attempt = 0; attempt < attempts; attempt++) {
            if (attempt > 0) await sleep(backoffDelay(attempt - 1));

            try {
                return await this.attempt<T>(method, path, body, options);
            } catch (error) {
                lastError = error instanceof ApiError ? error : ApiError.upstream(String(error));
                if (!lastError.retryable) throw lastError;
            }
        }

        throw lastError;
    }

    private async attempt<T>(method: string, path: string, body: unknown, options: RequestOptions): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        options.signal?.addEventListener("abort", () => controller.abort(), { once: true });

        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.resolveKey()}`,
            Accept: "application/json",
        };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        if (options.requestId) headers[API_HEADERS.requestId] = options.requestId;
        if (this.options.serverId) headers[API_HEADERS.serverId] = this.options.serverId;
        if (this.options.serverName) headers[API_HEADERS.serverName] = this.options.serverName;
        if (this.options.clientVersion) headers[API_HEADERS.pluginVersion] = this.options.clientVersion;

        let response: Response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal,
            });
        } catch (error) {
            // A network failure or timeout is indistinguishable from a restarting API, so it is
            // classified as upstream — which makes it retryable and queueable.
            throw ApiError.upstream(`Could not reach the Robtic API: ${error}`);
        } finally {
            clearTimeout(timeout);
        }

        const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

        if (!payload) {
            throw new ApiError(
                response.ok ? API_ERROR_CODES.internal : API_ERROR_CODES.upstreamUnavailable,
                `The API returned a non-JSON ${response.status} response`,
            );
        }

        if (payload.ok) return payload.data;

        throw new ApiError(payload.error.code, payload.error.message, payload.error.details ?? {});
    }
}
