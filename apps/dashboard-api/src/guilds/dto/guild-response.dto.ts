/**
 * `GET /guilds` — one entry per server this visitor can actually change something in.
 *
 * Narrower than Discord's partial guild on purpose: `permissions` is not here. The permission
 * bitfield is what the *server* used to decide this guild belongs in the list, and echoing it back
 * would invite a client to make that decision for itself.
 */
export interface GuildResponse {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
}
