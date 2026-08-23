import { MinecraftLinkRepository, RobsRepository } from "@database/repositories";

export interface RobsBalance {
    /** False when this Discord account has no Minecraft account linked in the guild. */
    linked: boolean;
    minecraftUsername?: string;
    minecraftUuid?: string;
    robs: number;
}

/**
 * A member's **robs** — the Minecraft currency — looked up from their Discord id.
 *
 * <h2>Why this needs a link and the game server does not</h2>
 *
 * Robs are keyed by Minecraft UUID, so in game they are read directly and work for anybody. Coming
 * the other way there is no such key: a Discord id says nothing about which Minecraft account it
 * belongs to, and `MinecraftLink` is the only thing that answers it. That is why `/balance` on
 * Discord is link-gated while `/bal` in game is not — the requirement is a property of the lookup
 * direction, not a rule imposed on the player.
 *
 * `linked: false` is an ordinary answer, not an error, and is distinct from a linked player who
 * simply has zero robs.
 */
export async function getRobsBalance(guildId: string, discordId: string): Promise<RobsBalance> {
    const link = await MinecraftLinkRepository.getByDiscordId(guildId, discordId);
    if (!link) return { linked: false, robs: 0 };

    const record = await RobsRepository.get(link.minecraftUuid);

    return {
        linked: true,
        minecraftUsername: link.minecraftUsername,
        minecraftUuid: link.minecraftUuid,
        robs: record?.robs ?? 0,
    };
}
