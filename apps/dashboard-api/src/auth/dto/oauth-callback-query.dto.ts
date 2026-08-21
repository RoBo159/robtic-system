import { IsOptional, IsString } from "class-validator";

/**
 * What Discord appends to `/auth/callback`.
 *
 * Everything is optional, which looks wrong for `code` and is not. Discord sends
 * `?error=access_denied&error_description=…&state=…` — with **no code** — when the visitor presses
 * *Cancel* on the consent screen. The global ValidationPipe runs with `forbidNonWhitelisted`, so an
 * undeclared `error` parameter would turn that ordinary decline into a 400 complaining about an
 * unexpected property, and a required `code` would turn it into a different 400. Declaring all four
 * and letting `OAuthStateService` decide keeps the decline on the path built for it: an honest
 * "start again" and a trip back to the dashboard.
 */
export class OAuthCallbackQueryDto {
    @IsOptional()
    @IsString()
    code?: string;

    @IsOptional()
    @IsString()
    state?: string;

    @IsOptional()
    @IsString()
    error?: string;

    /** Discord's own snake_case name, kept as-is so the parameter matches what arrives. */
    @IsOptional()
    @IsString()
    error_description?: string;
}
