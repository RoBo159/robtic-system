import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { GuildAccessGuard } from "../../auth/guards";
import { ACKNOWLEDGED, type AcknowledgementResponse } from "../../common";
import {
    UpdateQuestChannelDto,
    UpdateTierDto,
    UpdateUtcOffsetDto,
    type CommunityChallengeResponse,
    type QuestBoardEntryResponse,
    type QuestSettingsResponse,
} from "../dto";
import { QuestsService } from "../services";

@Controller("guilds/:guildId/quests")
@UseGuards(GuildAccessGuard)
export class QuestsController {
    constructor(private readonly quests: QuestsService) {}

    @Get("settings")
    settings(@Param("guildId") guildId: string): Promise<QuestSettingsResponse> {
        return this.quests.settings(guildId);
    }

    @Patch("settings/quest-channel")
    async setQuestChannel(
        @Param("guildId") guildId: string,
        @Body() body: UpdateQuestChannelDto,
    ): Promise<AcknowledgementResponse> {
        await this.quests.setChannel(guildId, "questChannelId", body.channelId);
        return ACKNOWLEDGED;
    }

    @Patch("settings/community-channel")
    async setCommunityChannel(
        @Param("guildId") guildId: string,
        @Body() body: UpdateQuestChannelDto,
    ): Promise<AcknowledgementResponse> {
        await this.quests.setChannel(guildId, "communityChannelId", body.channelId);
        return ACKNOWLEDGED;
    }

    @Patch("settings/tiers/:tier")
    async setTier(
        @Param("guildId") guildId: string,
        @Param("tier") tier: string,
        @Body() body: UpdateTierDto,
    ): Promise<AcknowledgementResponse> {
        await this.quests.setTierEnabled(guildId, tier, body.enabled);
        return ACKNOWLEDGED;
    }

    @Patch("settings/offset")
    async setOffset(
        @Param("guildId") guildId: string,
        @Body() body: UpdateUtcOffsetDto,
    ): Promise<AcknowledgementResponse> {
        await this.quests.setUtcOffset(guildId, body.utcOffsetMinutes);
        return ACKNOWLEDGED;
    }

    @Get("board")
    board(@Param("guildId") guildId: string): Promise<QuestBoardEntryResponse[]> {
        return this.quests.board(guildId);
    }

    @Get("community")
    community(@Param("guildId") guildId: string): Promise<CommunityChallengeResponse> {
        return this.quests.community(guildId);
    }
}
