import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { appConfig, discordConfig } from "../../config";
import {
    BOT_GUILD_CACHE_MS,
    DISCORD_API_BASE,
    DISCORD_AUTHORIZE_URL,
    DISCORD_OAUTH_SCOPES,
    PERMISSION_ADMINISTRATOR,
    PERMISSION_MANAGE_GUILD,
    USER_GUILD_CACHE_MS,
} from "../constants";
import type { DiscordChannel, DiscordPartialGuild, DiscordRole, DiscordUser } from "../interfaces";

/**
 * Everything this service knows about Discord.
 *
 * Two credentials with different reach live here: the visitor's OAuth token, which can only see
 * what they consented to (their identity and guild list), and the bot token, which can see a
 * guild's roles and channels. Keeping them in one place is what makes it obvious which calls run as
 * whom — asking Discord for a guild's channels with a user token would simply fail, and asking with
 * the bot token for a guild the user cannot manage would be an authorization hole.
 *
 * This is the repository of the auth module: it is the layer that talks to the outside system, and
 * nothing above it issues an HTTP request. It is named `*.service.ts` rather than `*.repository.ts`
 * only because "repository" in this codebase means a MongoDB aggregate, and calling an HTTP client
 * one would be the more confusing of the two lies.
 */
@Injectable()
export class DiscordService {
    /** Per visitor, so one person's navigation burst becomes one call rather than a dozen. */
    private readonly guildCache = new Map<string, { guilds: DiscordPartialGuild[]; expiresAt: number }>();

    private botGuilds: { ids: Set<string>; expiresAt: number } | null = null;

    constructor(
        @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
        @Inject(discordConfig.KEY) private readonly discord: ConfigType<typeof discordConfig>,
    ) {}

    authorizeUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: this.discord.clientId,
            redirect_uri: this.redirectUri,
            response_type: "code",
            scope: DISCORD_OAUTH_SCOPES,
            state,
            prompt: "none",
        });

        return `${DISCORD_AUTHORIZE_URL}?${params}`;
    }

    async exchangeCode(code: string): Promise<string> {
        const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: this.discord.clientId,
                client_secret: this.discord.clientSecret,
                grant_type: "authorization_code",
                code,
                redirect_uri: this.redirectUri,
            }),
        });

        if (!response.ok) throw new UnauthorizedException("Discord rejected the authorization code");

        const body = (await response.json()) as { access_token?: string };
        if (!body.access_token) throw new UnauthorizedException("Discord returned no access token");

        return body.access_token;
    }

    async currentUser(accessToken: string): Promise<DiscordUser> {
        const user = await this.asUser<DiscordUser>("/users/@me", accessToken);
        return { id: user.id, username: user.username, avatar: user.avatar };
    }

    /** The visitor's guilds, unfiltered — see `manageableGuilds` for the ones that matter. */
    async userGuilds(userId: string, accessToken: string): Promise<DiscordPartialGuild[]> {
        const hit = this.guildCache.get(userId);
        if (hit && hit.expiresAt > Date.now()) return hit.guilds;

        const guilds = await this.asUser<DiscordPartialGuild[]>("/users/@me/guilds", accessToken);
        this.guildCache.set(userId, { guilds, expiresAt: Date.now() + USER_GUILD_CACHE_MS });

        return guilds;
    }

    /**
     * Guilds the visitor may administer *and* the bot is in.
     *
     * Both halves are required. A guild the bot is not in has no configuration to edit, and a guild
     * the visitor cannot manage is somebody else's server — this is the single check the whole
     * dashboard's authorization rests on.
     */
    async manageableGuilds(userId: string, accessToken: string): Promise<DiscordPartialGuild[]> {
        const [guilds, botGuildIds] = await Promise.all([
            this.userGuilds(userId, accessToken),
            this.botGuildIds(),
        ]);

        return guilds.filter(guild => botGuildIds.has(guild.id) && canManage(guild));
    }

    async canManageGuild(userId: string, accessToken: string, guildId: string): Promise<boolean> {
        const guilds = await this.manageableGuilds(userId, accessToken);
        return guilds.some(guild => guild.id === guildId);
    }

    async guildRoles(guildId: string): Promise<DiscordRole[]> {
        const roles = await this.asBot<DiscordRole[]>(`/guilds/${guildId}/roles`);

        return roles
            .filter(role => role.id !== guildId)
            .sort((a, b) => b.position - a.position)
            .map(({ id, name, color, position }) => ({ id, name, color, position }));
    }

    async guildChannels(guildId: string): Promise<DiscordChannel[]> {
        const channels = await this.asBot<DiscordChannel[]>(`/guilds/${guildId}/channels`);

        return channels
            .sort((a, b) => a.position - b.position)
            .map(({ id, name, type, position }) => ({ id, name, type, position }));
    }

    /** Built from the public URL rather than configured separately, so it cannot drift from it. */
    private get redirectUri(): string {
        return `${this.app.publicApiUrl}/auth/callback`;
    }

    private async botGuildIds(): Promise<Set<string>> {
        if (this.botGuilds && this.botGuilds.expiresAt > Date.now()) return this.botGuilds.ids;

        const guilds = await this.asBot<Array<{ id: string }>>("/users/@me/guilds");
        const ids = new Set(guilds.map(guild => guild.id));
        this.botGuilds = { ids, expiresAt: Date.now() + BOT_GUILD_CACHE_MS };

        return ids;
    }

    private async asUser<T>(path: string, accessToken: string): Promise<T> {
        return this.request<T>(path, `Bearer ${accessToken}`);
    }

    private async asBot<T>(path: string): Promise<T> {
        return this.request<T>(path, `Bot ${this.discord.botToken}`);
    }

    private async request<T>(path: string, authorization: string): Promise<T> {
        const response = await fetch(`${DISCORD_API_BASE}${path}`, {
            headers: { Authorization: authorization },
        });

        if (response.status === 401) throw new UnauthorizedException("Discord rejected the credential");
        if (!response.ok) throw new Error(`Discord ${path} responded ${response.status}`);

        return (await response.json()) as T;
    }
}

function canManage(guild: DiscordPartialGuild): boolean {
    if (guild.owner) return true;

    const permissions = BigInt(guild.permissions);

    return (
        (permissions & PERMISSION_MANAGE_GUILD) === PERMISSION_MANAGE_GUILD ||
        (permissions & PERMISSION_ADMINISTRATOR) === PERMISSION_ADMINISTRATOR
    );
}
