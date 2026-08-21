import { Body, Controller, Get, Param, Patch, Put, UseGuards } from "@nestjs/common";
import { CurrentUserId } from "../../auth/decorators";
import { GuildAccessGuard } from "../../auth/guards";
import { ACKNOWLEDGED, type AcknowledgementResponse } from "../../common";
import {
    UpdateCommandsChannelDto,
    UpdateFeatureDto,
    UpdatePrefixDto,
    UpdateRoleIdsDto,
    type GuildSettingsResponse,
} from "../dto";
import { SettingsService } from "../services";

/**
 * Guild configuration.
 *
 * `@UseGuards(GuildAccessGuard)` is on the class, not on individual handlers: every route here is
 * guild-scoped, and per-handler guards would make the one that was missed look deliberate.
 */
@Controller("guilds/:guildId/settings")
@UseGuards(GuildAccessGuard)
export class SettingsController {
    constructor(private readonly settings: SettingsService) {}

    @Get()
    read(@Param("guildId") guildId: string): Promise<GuildSettingsResponse> {
        return this.settings.read(guildId);
    }

    @Patch("prefix")
    async setPrefix(
        @Param("guildId") guildId: string,
        @Body() body: UpdatePrefixDto,
    ): Promise<AcknowledgementResponse> {
        await this.settings.setPrefix(guildId, body.prefix);
        return ACKNOWLEDGED;
    }

    @Patch("commands-channel")
    async setCommandsChannel(
        @Param("guildId") guildId: string,
        @Body() body: UpdateCommandsChannelDto,
    ): Promise<AcknowledgementResponse> {
        await this.settings.setCommandsChannel(guildId, body.channelId);
        return ACKNOWLEDGED;
    }

    @Put("bot-admin-roles")
    async setBotAdminRoles(
        @Param("guildId") guildId: string,
        @Body() body: UpdateRoleIdsDto,
    ): Promise<AcknowledgementResponse> {
        await this.settings.setBotAdminRoles(guildId, body.roleIds);
        return ACKNOWLEDGED;
    }

    @Patch("features/:key")
    async setFeature(
        @Param("guildId") guildId: string,
        @Param("key") key: string,
        @Body() body: UpdateFeatureDto,
        @CurrentUserId() actorId: string,
    ): Promise<AcknowledgementResponse> {
        await this.settings.setFeature(guildId, key, body.enabled, actorId);
        return ACKNOWLEDGED;
    }

    @Put("staff-tiers/:key/roles")
    async setStaffTierRoles(
        @Param("guildId") guildId: string,
        @Param("key") key: string,
        @Body() body: UpdateRoleIdsDto,
    ): Promise<AcknowledgementResponse> {
        await this.settings.setStaffTierRoles(guildId, key, body.roleIds);
        return ACKNOWLEDGED;
    }
}
