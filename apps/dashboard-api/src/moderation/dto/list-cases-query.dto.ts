import { IsIn, IsOptional } from "class-validator";
import { IsDiscordId, LimitQueryDto } from "../../common";
import { PUNISHMENT_TYPES, type PunishmentType } from "../interfaces";

/**
 * `GET /guilds/:guildId/moderation/cases?type=&userId=&limit=`
 *
 * Extends `LimitQueryDto` for the paging half. Every field is optional — an unfiltered call is the
 * common one, and it is what the dashboard's moderation page makes.
 */
export class ListCasesQueryDto extends LimitQueryDto {
    @IsOptional()
    @IsIn(PUNISHMENT_TYPES)
    type?: PunishmentType;

    @IsOptional()
    @IsDiscordId()
    userId?: string;
}
