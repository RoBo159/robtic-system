import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_CONFIG_MESSAGES, QUEST_LIMITS } from "@constants";
import type { IQuestWindow } from "@database/models";
import { QuestSettingsRepository } from "@database/repositories";

const TEXT = QUEST_CONFIG_MESSAGES.window;

/** Window keys end up inside the generation key ("2026-08-15#morning"), so they stay boring. */
const normalizeKey = (raw: string): string =>
    raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

/**
 * A plain copy of a stored window.
 *
 * Field by field rather than a spread: `settings.windows` holds hydrated Mongoose subdocuments, and
 * spreading one copies its internals instead of its schema fields — which would then be written
 * straight back over the guild's windows.
 */
const plain = (window: IQuestWindow): IQuestWindow => ({
    key: window.key,
    startHour: window.startHour,
    endHour: window.endHour,
    enabled: window.enabled,
});

/**
 * Adds a window, or replaces one with the same key.
 *
 * Replacing rather than rejecting a duplicate: an admin retyping `morning` with different hours
 * means "make it these hours", and the alternative is making them remove it first for no reason.
 *
 * An end hour at or before the start is not an error — it reads as crossing midnight, which is
 * exactly what a late-night window needs.
 */
export const windowAdd: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const key = normalizeKey(interaction.options.getString("key", true));

    if (!key) {
        await interaction.editReply({ content: TEXT.unusableKey });
        return;
    }

    const startHour = interaction.options.getInteger("start-hour", true);
    const endHour = interaction.options.getInteger("end-hour", true);

    const settings = await QuestSettingsRepository.getCached(guildId);
    const existing = settings.windows.find(window => window.key === key);

    if (!existing && settings.windows.length >= QUEST_LIMITS.maxWindows) {
        await interaction.editReply({ content: TEXT.tooMany(QUEST_LIMITS.maxWindows) });
        return;
    }

    const windows: IQuestWindow[] = [
        ...settings.windows.filter(window => window.key !== key).map(plain),
        { key, startHour, endHour, enabled: true },
    ].sort((a, b) => a.startHour - b.startHour);

    await QuestSettingsRepository.setWindows(guildId, windows);

    await interaction.editReply({
        content: TEXT.saved(Boolean(existing), TEXT.describe({ key, startHour, endHour, enabled: true })),
    });
};

export const windowRemove: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const key = normalizeKey(interaction.options.getString("key", true));

    const settings = await QuestSettingsRepository.getCached(guildId);
    const remaining = settings.windows.filter(window => window.key !== key).map(plain);

    if (remaining.length === settings.windows.length) {
        await interaction.editReply({ content: TEXT.notFound(key) });
        return;
    }

    await QuestSettingsRepository.setWindows(guildId, remaining);

    await interaction.editReply({
        content: remaining.length === 0 ? TEXT.removedLast(key) : TEXT.removed(key),
    });
};

export const windowList: FeatureSubcommandHandler = async (interaction, _client) => {
    const settings = await QuestSettingsRepository.getCached(interaction.guildId!);
    const clock = QUEST_CONFIG_MESSAGES.utcClock(settings.utcOffsetMinutes);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle(TEXT.listTitle)
            .setColor(COLORS.info)
            .setDescription(settings.windows.length > 0
                ? settings.windows.map(window => TEXT.describe(window)).join("\n")
                : TEXT.listEmpty)
            .setFooter({ text: TEXT.listFooter(clock) })],
    });
};

/** Autocomplete source for `window remove`. */
export async function windowKeys(guildId: string): Promise<string[]> {
    const settings = await QuestSettingsRepository.getCached(guildId);
    return settings.windows.map(window => window.key);
}
