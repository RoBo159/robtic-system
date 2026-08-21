/** A Discord account, as `/users/@me` returns it. */
export interface DiscordUser {
    id: string;
    username: string;
    avatar: string | null;
}
