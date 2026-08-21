import { applyDecorators } from "@nestjs/common";
import { IsString, Matches } from "class-validator";
import { DISCORD_ID_PATTERN } from "../constants";

/**
 * Validates one Discord snowflake on a DTO property.
 *
 * The `@IsString() @Matches(/^\d{15,25}$/)` pair was repeated in four DTO classes across two
 * modules, each with its own copy of the pattern and its own wording of the message. One composed
 * decorator means the rule has a single definition — and, more to the point, a single place to
 * change when Discord's snowflakes grow a digit.
 *
 * `each` forwards to `@Matches`, so an array property is validated element by element:
 *
 *     @IsDiscordId({ each: true })
 *     roleIds: string[];
 */
export const IsDiscordId = (options?: { each?: boolean }): PropertyDecorator =>
    applyDecorators(
        IsString({ each: options?.each }),
        Matches(DISCORD_ID_PATTERN, { each: options?.each, message: "$property must be a Discord id" }),
    );
