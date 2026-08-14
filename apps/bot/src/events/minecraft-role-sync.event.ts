import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { syncMemberPermissions } from "@core/minecraft";

/**
 * Re-syncs LuckPerms groups when a member's roles change. Other member updates (nickname, avatar,
 * timeout) are ignored so an unrelated edit doesn't queue a pointless bridge event.
 */
export default {
    name: Events.GuildMemberUpdate,

    async execute(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember, _client: BotClient) {
        const before = oldMember.roles?.cache;
        if (before && before.size === newMember.roles.cache.size && before.every((_, id) => newMember.roles.cache.has(id))) {
            return;
        }

        await syncMemberPermissions(newMember, "roles_changed");
    },
};
