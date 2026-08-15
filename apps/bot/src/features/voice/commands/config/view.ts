import { EmbedBuilder, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { VoiceSettingsRepository } from "@database/repositories";
import { hasGuildBotAdmin } from "@bot/utils/access";

const list = (ids: string[], empty: string) => (ids.length ? ids.map(id => `<#${id}>`).join(", ") : empty);

export const view: FeatureSubcommandHandler = async (interaction, _client) => {
    const member = interaction.member as GuildMember | null;
    if (!member || !(await hasGuildBotAdmin(member))) {
        await interaction.editReply({ content: "Only administrators can view the voice settings." });
        return;
    }

    const s = await VoiceSettingsRepository.getCached(interaction.guildId!);
    const afkChannelId = interaction.guild?.afkChannelId;

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("🎙️ Voice settings")
            .setColor(s.enabled ? COLORS.info : COLORS.warning)
            .addFields(
                { name: "Status", value: s.enabled ? "Enabled" : "Disabled", inline: true },
                { name: "Alone multiplier", value: `${Math.round(s.aloneMultiplier * 100)}%`, inline: true },
                { name: "AFK timeout", value: `${s.afkTimeoutMinutes} min`, inline: true },
                { name: "Tracked channels", value: list(s.trackedChannelIds, "All voice channels") },
                { name: "Excluded channels", value: list(s.excludedChannelIds, "None") },
                { name: "Allowed roles", value: s.allowedRoleIds.length ? s.allowedRoleIds.map(id => `<@&${id}>`).join(", ") : "Everyone" },
                { name: "Server AFK channel", value: afkChannelId ? `<#${afkChannelId}> — never earns` : "Not set" },
            )
            .setFooter({ text: "Muted and deafened members still earn, as long as they have been active recently." })],
    });
};
