import { MinecraftLinkRepository, MinecraftLinkCodeRepository } from "@database/repositories";
import { Logger } from "@logger";

export type LinkFailureReason = "invalid_code" | "discord_already_linked" | "uuid_already_linked";

export type RedeemLinkResult =
    | { ok: true; minecraftUuid: string; minecraftUsername: string; serverKey: string }
    | { ok: false; reason: LinkFailureReason; minecraftUsername?: string };

/**
 * Redeems a code issued in-game by `/link`. The code is claimed atomically before any other check,
 * so a code can never be spent twice; a failed post-claim check discards it and the player simply
 * runs `/link` again.
 *
 * Permission sync is the caller's job — only the caller holds the GuildMember whose roles the
 * delta is computed from (see `syncMemberPermissions`).
 */
export async function redeemLinkCode(
    guildId: string,
    discordId: string,
    code: string,
): Promise<RedeemLinkResult> {
    const claimed = await MinecraftLinkCodeRepository.claim(guildId, code.trim());
    if (!claimed) return { ok: false, reason: "invalid_code" };

    const existingForDiscord = await MinecraftLinkRepository.getByDiscordId(guildId, discordId);
    if (existingForDiscord) {
        return {
            ok: false,
            reason: "discord_already_linked",
            minecraftUsername: existingForDiscord.minecraftUsername,
        };
    }

    const existingForUuid = await MinecraftLinkRepository.getByUuid(guildId, claimed.minecraftUuid);
    if (existingForUuid) {
        return {
            ok: false,
            reason: "uuid_already_linked",
            minecraftUsername: existingForUuid.minecraftUsername,
        };
    }

    await MinecraftLinkRepository.create(
        guildId,
        discordId,
        claimed.minecraftUuid,
        claimed.minecraftUsername,
        claimed.serverKey,
    );

    Logger.info(
        `Linked Discord ${discordId} to ${claimed.minecraftUsername} (${claimed.minecraftUuid})`,
        "Minecraft",
    );

    return {
        ok: true,
        minecraftUuid: claimed.minecraftUuid,
        minecraftUsername: claimed.minecraftUsername,
        serverKey: claimed.serverKey,
    };
}
