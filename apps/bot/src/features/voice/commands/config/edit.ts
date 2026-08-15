import { EmbedBuilder, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, VOICE_LIMITS } from "@constants";
import { VoiceSettingsRepository } from "@database/repositories";
import { hasGuildBotAdmin } from "@bot/utils/access";

const DENIED = "Only administrators can change the voice settings.";

async function requireAdmin(interaction: Parameters<FeatureSubcommandHandler>[0]): Promise<boolean> {
    const member = interaction.member as GuildMember | null;
    if (member && await hasGuildBotAdmin(member)) return true;

    await interaction.editReply({ content: DENIED });
    return false;
}

const ok = (description: string) =>
    ({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(description)] });

export const toggle: FeatureSubcommandHandler = async (interaction, _client) => {
    if (!(await requireAdmin(interaction))) return;

    const enabled = interaction.options.getBoolean("enabled", true);
    await VoiceSettingsRepository.update(interaction.guildId!, { $set: { enabled } });

    await interaction.editReply(ok(`Voice rewards are now **${enabled ? "on" : "off"}** in this server.`));
};

/** One handler for both channel lists — they differ only in which field they edit. */
const editChannels = (field: "trackedChannelIds" | "excludedChannelIds", label: string): FeatureSubcommandHandler =>
    async (interaction, _client) => {
        if (!(await requireAdmin(interaction))) return;

        const channel = interaction.options.getChannel("channel", true);
        const remove = interaction.options.getBoolean("remove") ?? false;

        const settings = await VoiceSettingsRepository.editChannel(
            interaction.guildId!, field, channel.id, remove ? "remove" : "add",
        );

        const current = settings[field];
        await interaction.editReply(ok(
            `${remove ? "Removed" : "Added"} <#${channel.id}> ${remove ? "from" : "to"} **${label}**.\n` +
            (current.length ? current.map(id => `<#${id}>`).join(", ") : "_none — the default applies_")
        ));
    };

export const track = editChannels("trackedChannelIds", "tracked channels");
export const exclude = editChannels("excludedChannelIds", "excluded channels");

export const rates: FeatureSubcommandHandler = async (interaction, _client) => {
    if (!(await requireAdmin(interaction))) return;

    // Taken as a percentage because Discord has no decimal option type, and "25" reads better
    // than "0.25" to whoever is configuring it.
    const alonePercent = interaction.options.getInteger("alone-multiplier");
    const afkMinutes = interaction.options.getInteger("afk-minutes");

    if (alonePercent === null && afkMinutes === null) {
        await interaction.editReply({ content: "Give me at least one of `alone-multiplier` or `afk-minutes`." });
        return;
    }

    const update: Record<string, number> = {};
    if (alonePercent !== null) update.aloneMultiplier = alonePercent / 100;
    if (afkMinutes !== null) {
        update.afkTimeoutMinutes = Math.min(
            VOICE_LIMITS.afkTimeoutMinutes.max,
            Math.max(VOICE_LIMITS.afkTimeoutMinutes.min, afkMinutes),
        );
    }

    const settings = await VoiceSettingsRepository.update(interaction.guildId!, { $set: update });

    await interaction.editReply(ok(
        `Alone multiplier **${Math.round(settings.aloneMultiplier * 100)}%** · AFK timeout **${settings.afkTimeoutMinutes} min**.`
    ));
};
