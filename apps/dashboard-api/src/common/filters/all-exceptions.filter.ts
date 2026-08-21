import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import type { ErrorResponse } from "../interfaces";

/**
 * Logs every failed request, and answers in exactly the shape Nest already answered in.
 *
 * The shape is load-bearing: `apps/dashboard/src/lib/api.ts` reads `message` off the error body to
 * show the operator why a save was refused. So an `HttpException` is re-emitted **verbatim** — its
 * own status, its own body — rather than being rewrapped in a house format. A filter that
 * "standardises" error responses is the usual way that contract gets broken silently.
 *
 * What this adds is the logging, and it is added for one specific failure. `DiscordService` throws a
 * plain `Error` when Discord answers something unexpected; Nest turns that into a bare 500, and the
 * operator sees "Request failed (500)" while the reason — which Discord endpoint, which status —
 * exists only in a stack trace nobody correlated to a route. Here the route is logged beside it.
 *
 * Only 5xx is logged. A 401 from an expired session and a 403 from someone opening a guild they do
 * not administer are both the system working correctly, and logging them would bury the failures
 * that are not.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const context = host.switchToHttp();
        const response = context.getResponse<Response>();
        const request = context.getRequest<Request>();

        const route = `${request.method} ${request.originalUrl ?? request.url}`;

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse();

            if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
                this.logger.error(`${route} → ${status}`, exception.stack);
            }

            this.send(response, status, typeof body === "string" ? { statusCode: status, message: body } : body);
            return;
        }

        this.logger.error(
            `${route} → 500 ${exception instanceof Error ? exception.message : String(exception)}`,
            exception instanceof Error ? exception.stack : undefined,
        );

        this.send(response, HttpStatus.INTERNAL_SERVER_ERROR, {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: "Internal server error",
        } satisfies ErrorResponse);
    }

    private send(response: Response, status: number, body: unknown): void {
        if (response.headersSent) return;

        response.status(status).json(body);
    }
}
