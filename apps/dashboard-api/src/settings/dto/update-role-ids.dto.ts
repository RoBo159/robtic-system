import { IsArray } from "class-validator";
import { IsDiscordId } from "../../common";

/**
 * The whole role list, for the two `PUT` endpoints that replace one.
 *
 * `PUT` rather than `PATCH` because the body is the complete new state — the server diffs it against
 * what is stored. A partial body would leave the caller guessing whether an omitted role was
 * unchanged or removed.
 */
export class UpdateRoleIdsDto {
    @IsArray()
    @IsDiscordId({ each: true })
    roleIds: string[];
}
