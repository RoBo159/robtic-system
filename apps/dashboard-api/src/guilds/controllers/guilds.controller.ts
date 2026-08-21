import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentSession } from "../../auth/decorators";
import { GuildAccessGuard } from "../../auth/guards";
import type { SessionPayload } from "../../auth/interfaces";
import type { GuildDirectoryResponse, GuildResponse } from "../dto";
import { GuildsService } from "../services";

@Controller("guilds")
export class GuildsController {
    constructor(private readonly guilds: GuildsService) {}

    /**
     * The guild picker: everywhere this visitor can actually change something.
     *
     * No `GuildAccessGuard` here, and correctly so — this route names no guild. It is the route that
     * *tells* the visitor which guilds they may open, and it is filtered by the session's own
     * Discord token rather than by a `:guildId` anyone could type.
     */
    @Get()
    list(@CurrentSession() session: SessionPayload): Promise<GuildResponse[]> {
        return this.guilds.listManageable(session);
    }

    @Get(":guildId/directory")
    @UseGuards(GuildAccessGuard)
    directory(@Param("guildId") guildId: string): Promise<GuildDirectoryResponse> {
        return this.guilds.directory(guildId);
    }
}
