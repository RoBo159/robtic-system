import { Events, type GuildMember } from "discord.js";
import type { EventConfig } from "@typings/event";
import {
    setPremiumRoleProvider,
    startPremiumEngine,
    invalidatePremiumMember,
    invalidatePremiumGuild,
} from "@core/premium";
import { Logger } from "@logger";

const CTX = "premium";

let stopEngine: (() => void) | null = null;

export default [
    {
        name: Events.ClientReady,
        once: true,
        execute: client => {
            /**
             * The only role read in the entire system.
             *
             * Served from the gateway's resident member cache, with a fetch as the fallback for a
             * member Discord has not sent us — so the hot path is a map lookup and the cold path
             * costs one request per member per cache window rather than per event.
             */
            setPremiumRoleProvider(async (guildId, discordId) => {
                const guild = client.guilds.cache.get(guildId);
                if (!guild) return [];

                const member = guild.members.cache.get(discordId)
                    ?? await guild.members.fetch(discordId).catch(() => null);

                return member ? [...member.roles.cache.keys()] : [];
            });

            stopEngine = startPremiumEngine();
            Logger.info("Premium engine started", CTX);
        },
    } satisfies EventConfig<Events.ClientReady>,

    /**
     * A role change is the one event that can silently make a cached answer wrong.
     *
     * Compared rather than assumed: nicknames, timeouts and avatars all fire this event, and
     * evicting on every one of them would empty the cache on a busy server for no reason.
     */
    {
        name: Events.GuildMemberUpdate,
        execute: (oldMember, newMember) => {
            const before = oldMember as GuildMember;
            const after = newMember as GuildMember;

            if (before.roles.cache.size === after.roles.cache.size
                && before.roles.cache.every((_, id) => after.roles.cache.has(id))) {
                return;
            }

            invalidatePremiumMember(after.guild.id, after.id);
        },
    } satisfies EventConfig<Events.GuildMemberUpdate>,

    {
        name: Events.GuildDelete,
        execute: guild => {
            invalidatePremiumGuild(guild.id);
            Logger.debug(`Dropped premium state for departed guild ${guild.id}`, CTX);
        },
    } satisfies EventConfig<Events.GuildDelete>,
];

/** Detaches the mutation listener on reload, so a stale closure cannot keep evicting. */
export function stopPremiumEngine(): void {
    stopEngine?.();
    stopEngine = null;
    setPremiumRoleProvider(null);
}
