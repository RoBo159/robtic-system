/**
 * The error body every failed request returns.
 *
 * This is Nest's own `HttpException` shape, written down rather than changed. The dashboard reads
 * `message` off it (`apps/dashboard/src/lib/api.ts`), so it is a published contract — naming it here
 * is what lets `AllExceptionsFilter` promise to preserve it.
 */
export interface ErrorResponse {
    statusCode: number;
    message: string | string[];
    error?: string;
}
