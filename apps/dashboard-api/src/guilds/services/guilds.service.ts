import { Injectable } from "@nestjs/common";
import { DiscordService } from "../../auth/services";
import type { SessionPayload } from "../../auth/interfaces";
import type { GuildDirectoryResponse, GuildResponse } from "../dto";

/**
 * The guild picker and the pickers inside a guild.
 *
 * No repository of its own: this module's whole data source is Discord, and `DiscordService` is
 * already that layer. Adding a `GuildsRepository` that forwarded every call would be a file, not a
 * boundary.
 *
 * What this does own is the projection — deciding which Discord fields cross the wire. That was
 * inline in the controller before, which meant the response shape and the routing lived in the same
 * method and neither could be read without the other.
 */
@Injectable()
export class GuildsService {
    constructor(private readonly discord: DiscordService) {}

    async listManageable(session: SessionPayload): Promise<GuildResponse[]> {
        const guilds = await this.discord.manageableGuilds(session.sub, session.accessToken);

        return guilds.map(({ id, name, icon, owner }) => ({ id, name, icon, owner }));
    }

    /** Both halves in parallel — they are independent calls and the page needs both to render. */
    async directory(guildId: string): Promise<GuildDirectoryResponse> {
        const [roles, channels] = await Promise.all([
            this.discord.guildRoles(guildId),
            this.discord.guildChannels(guildId),
        ]);

        return { roles, channels };
    }
}
