import { QuestSettings } from "@database/models";
import { QuestSettingsRepository } from "@database/repositories";
import { Logger } from "@logger";

const CTX = "quests";

/**
 * Folds the old per-tier channels into the single quest channel.
 *
 * `dailyChannelId` and `vipChannelId` were replaced by `questChannelId`. Renaming the field alone
 * would leave every guild that had already configured one posting quests nowhere, with nothing to
 * say why — so the daily channel is carried across, falling back to the VIP one for the guild that
 * only ever set that.
 *
 * Runs on every boot and only touches rows that still carry a legacy field, so it is idempotent and
 * costs one query once the fleet has been through it. The legacy fields are unset afterwards, which
 * is what stops the next boot finding them again.
 */
export async function migrateQuestChannels(): Promise<void> {
    const legacy = await QuestSettings.find({
        $or: [{ dailyChannelId: { $exists: true } }, { vipChannelId: { $exists: true } }],
    }).lean<Array<{ guildId: string; questChannelId?: string | null; dailyChannelId?: string | null; vipChannelId?: string | null }>>()
        .catch(() => null);

    if (!legacy?.length) return;

    let migrated = 0;

    for (const row of legacy) {
        const carried = row.questChannelId ?? row.dailyChannelId ?? row.vipChannelId ?? null;

        await QuestSettings.updateOne(
            { guildId: row.guildId },
            {
                ...(carried ? { $set: { questChannelId: carried } } : {}),
                $unset: { dailyChannelId: "", vipChannelId: "" },
            },
        ).catch(err => Logger.warn(`Could not migrate quest channels for ${row.guildId}: ${err}`, CTX));

        QuestSettingsRepository.invalidate(row.guildId);
        if (carried) migrated++;
    }

    Logger.info(`Folded per-tier quest channels into one for ${migrated} guild(s)`, CTX);
}
