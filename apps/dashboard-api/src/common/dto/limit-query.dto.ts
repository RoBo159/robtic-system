import { IsOptional, IsString } from "class-validator";

/**
 * The `?limit=` every list endpoint accepts.
 *
 * Kept as a string and resolved by `resolveLimit` in the service rather than coerced to a number
 * here. Two reasons: the global ValidationPipe runs with `forbidNonWhitelisted`, so an undeclared
 * query parameter is a 400 — which is exactly why this class must exist at all — and clamping is a
 * policy decision that belongs in a service, not in a transform annotation on a DTO.
 *
 * Extend it for endpoints that filter as well as page; see `ListCasesQueryDto`.
 */
export class LimitQueryDto {
    @IsOptional()
    @IsString()
    limit?: string;
}
