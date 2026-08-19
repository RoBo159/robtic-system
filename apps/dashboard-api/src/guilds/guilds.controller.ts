import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { DiscordService } from "../auth/discord.service";
import { GuildAccessGuard } from "../auth/guild-access.guard";
import type { AuthenticatedRequest } from "../auth/session.guard";

@Controller("guilds")
export class GuildsController {
    constructor(private readonly discord: DiscordService) {}

    /** The guild picker: everywhere this visitor can actually change something. */
    @Get()
    async list(@Req() request: AuthenticatedRequest) {
        const guilds = await this.discord.manageableGuilds(request.session.sub, request.session.accessToken);
        return guilds.map(({ id, name, icon, owner }) => ({ id, name, icon, owner }));
    }

    /**
     * Roles and channels for the pickers on every settings screen.
     *
     * Served from here rather than fetched by the browser because reading them needs the bot token,
     * which must never reach a page script.
     */
    @Get(":guildId/directory")
    @UseGuards(GuildAccessGuard)
    async directory(@Param("guildId") guildId: string) {
        const [roles, channels] = await Promise.all([
            this.discord.guildRoles(guildId),
            this.discord.guildChannels(guildId),
        ]);
        return { roles, channels };
    }
}
