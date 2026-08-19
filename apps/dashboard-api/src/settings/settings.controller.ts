import { Body, Controller, Get, Param, Patch, Put, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsString, Length, Matches } from "class-validator";
import { GuildAccessGuard } from "../auth/guild-access.guard";
import type { AuthenticatedRequest } from "../auth/session.guard";
import { SettingsService } from "./settings.service";

class PrefixDto {
    // The prefix router does `content.startsWith(prefix)`, so whitespace would make every command
    // unreachable and an empty string would make every message one.
    @IsString()
    @Length(1, 5)
    @Matches(/^\S+$/, { message: "prefix cannot contain spaces" })
    prefix: string;
}

class ChannelDto {
    @IsString()
    @Matches(/^\d{15,25}$/, { message: "not a Discord id" })
    channelId: string;
}

class RoleIdsDto {
    @IsArray()
    @Matches(/^\d{15,25}$/, { each: true, message: "not a Discord id" })
    roleIds: string[];
}

class FeatureDto {
    @IsBoolean()
    enabled: boolean;
}

@Controller("guilds/:guildId/settings")
@UseGuards(GuildAccessGuard)
export class SettingsController {
    constructor(private readonly settings: SettingsService) {}

    @Get()
    read(@Param("guildId") guildId: string) {
        return this.settings.read(guildId);
    }

    @Patch("prefix")
    async setPrefix(@Param("guildId") guildId: string, @Body() body: PrefixDto) {
        await this.settings.setPrefix(guildId, body.prefix);
        return { ok: true };
    }

    @Patch("commands-channel")
    async setCommandsChannel(@Param("guildId") guildId: string, @Body() body: ChannelDto) {
        await this.settings.setCommandsChannel(guildId, body.channelId);
        return { ok: true };
    }

    @Put("bot-admin-roles")
    async setBotAdminRoles(@Param("guildId") guildId: string, @Body() body: RoleIdsDto) {
        await this.settings.setBotAdminRoles(guildId, body.roleIds);
        return { ok: true };
    }

    @Patch("features/:key")
    async setFeature(
        @Param("guildId") guildId: string,
        @Param("key") key: string,
        @Body() body: FeatureDto,
        @Req() request: AuthenticatedRequest,
    ) {
        // Attributed to the visitor rather than to "dashboard", so `/feature list` still answers
        // who turned something off.
        await this.settings.setFeature(guildId, key, body.enabled, request.session.sub);
        return { ok: true };
    }

    @Put("staff-tiers/:key/roles")
    async setStaffTierRoles(
        @Param("guildId") guildId: string,
        @Param("key") key: string,
        @Body() body: RoleIdsDto,
    ) {
        await this.settings.setStaffTierRoles(guildId, key, body.roleIds);
        return { ok: true };
    }
}
