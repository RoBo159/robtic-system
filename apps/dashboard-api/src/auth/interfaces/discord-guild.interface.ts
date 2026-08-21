/**
 * A guild as it appears in `/users/@me/guilds` — a partial object, not a full guild.
 *
 * `permissions` is a bitfield serialised as a decimal *string*, because it exceeds `Number.MAX_SAFE_INTEGER`.
 * It has to be parsed with `BigInt`; reading it as a number silently loses the high bits, which are
 * where several permissions live.
 */
export interface DiscordPartialGuild {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
}

export interface DiscordRole {
    id: string;
    name: string;
    color: number;
    position: number;
}

export interface DiscordChannel {
    id: string;
    name: string;
    type: number;
    position: number;
}
