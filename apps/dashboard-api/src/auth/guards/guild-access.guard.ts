import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "../interfaces";
import { DiscordService } from "../services";

/**
 * The one authorization check every guild-scoped route depends on.
 *
 * `:guildId` in a URL is attacker-controlled, so it is never enough that the visitor has a session —
 * they must hold Manage Server (or own the guild), and the bot must be in it. Both are asked of
 * Discord rather than of our own database, because our database has no opinion about who
 * administers a Discord server and would happily hand over another guild's configuration.
 *
 * Applied per controller with `@UseGuards`, not globally, because only some routes name a guild.
 * `apps/dashboard-api/test/route-check.ts` asserts that every guild-scoped controller carries it —
 * the failure mode otherwise is silent, and serves one server's configuration to another's admin.
 */
@Injectable()
export class GuildAccessGuard implements CanActivate {
    constructor(private readonly discord: DiscordService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

        const guildId = request.params?.guildId;
        if (typeof guildId !== "string" || !guildId) throw new ForbiddenException("No guild in this request");

        const allowed = await this.discord.canManageGuild(
            request.session.sub,
            request.session.accessToken,
            guildId,
        );

        if (!allowed) {
            throw new ForbiddenException("You cannot manage this server");
        }

        return true;
    }
}
