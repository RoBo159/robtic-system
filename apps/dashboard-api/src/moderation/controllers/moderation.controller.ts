import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { GuildAccessGuard } from "../../auth/guards";
import { LimitQueryDto } from "../../common";
import {
    ListCasesQueryDto,
    type AuditEntryResponse,
    type MemberRecordResponse,
    type ModerationCaseResponse,
    type PunishConfigResponse,
} from "../dto";
import { ModerationService } from "../services";

/**
 * Moderation history. **GET only** — see `ModerationService` for why writes are not here.
 */
@Controller("guilds/:guildId/moderation")
@UseGuards(GuildAccessGuard)
export class ModerationController {
    constructor(private readonly moderation: ModerationService) {}

    @Get("cases")
    cases(
        @Param("guildId") guildId: string,
        @Query() query: ListCasesQueryDto,
    ): Promise<ModerationCaseResponse[]> {
        return this.moderation.listCases(guildId, query);
    }

    @Get("members/:userId")
    member(
        @Param("guildId") guildId: string,
        @Param("userId") userId: string,
    ): Promise<MemberRecordResponse> {
        return this.moderation.memberRecord(guildId, userId);
    }

    @Get("config")
    config(@Param("guildId") guildId: string): Promise<PunishConfigResponse> {
        return this.moderation.config(guildId);
    }

    @Get("audit")
    audit(
        @Param("guildId") guildId: string,
        @Query() query: LimitQueryDto,
    ): Promise<AuditEntryResponse[]> {
        return this.moderation.listAudit(guildId, query.limit);
    }
}
