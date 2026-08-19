import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { DiscordService } from "./discord.service";
import type { AuthenticatedRequest } from "./session.guard";

/**
 * The one authorization check every guild-scoped route depends on.
 *
 * `:guildId` in a URL is attacker-controlled, so it is never enough that the visitor has a session —
 * they must hold Manage Server (or own the guild), and the bot must be in it. Both are asked of
 * Discord rather than of our own database, because our database has no opinion about who
 * administers a Discord server and would happily hand over another guild's configuration.
 */
@Injectable()
export class GuildAccessGuard implements CanActivate {
    constructor(private readonly discord: DiscordService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

        // Express types route params as `string | string[]`, and a repeated `:guildId` would arrive
        // as an array. Refusing that outright is safer than picking one of them.
        const guildId = request.params?.guildId;
        if (typeof guildId !== "string" || !guildId) throw new ForbiddenException("No guild in this request");

        const allowed = await this.discord.canManageGuild(request.session.sub, request.session.accessToken, guildId);
        if (!allowed) {
            // Deliberately the same answer whether the guild does not exist, the bot is not in it,
            // or the visitor simply may not touch it — the difference is not theirs to learn.
            throw new ForbiddenException("You cannot manage this server");
        }

        return true;
    }
}
