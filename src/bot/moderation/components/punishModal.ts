import {
    ModalSubmitInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { Colors } from "@core/config";
import { ReasonRepository } from "@database/repositories";
import { getMemberLevel } from "@shared/utils/access";
import data from "@shared/data.json";
import { executeWarn } from "../commands/warn";
import { executeMute } from "../commands/mute";
import { executeBan } from "../commands/ban";

export const punishModalHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^punish_modal_(warn|mute|ban)_(\d+)$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        const parts = interaction.customId.match(/^punish_modal_(warn|mute|ban)_(\d+)$/);
        if (!parts) return;
        
        const type = parts[1] as "warn" | "mute" | "ban";
        const targetId = parts[2];
        const guildId = interaction.guildId!;
        const modMember = interaction.member as GuildMember;

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        const targetMember = await interaction.guild?.members.fetch(targetId).catch(() => null);

        if (!targetUser) {
            await interaction.reply({ content: "User not found.", flags: MessageFlags.Ephemeral });
            return;
        }

        const reasonRaw = interaction.fields.getTextInputValue("reason").trim();
        // Since modals can't do autocomplete, we'll try to find a reason key
        // If not found, we use the raw text as both key and label.
        let reason = reasonRaw;
        let reasonAr = reasonRaw;
        let reasonKey = reasonRaw;
        
        const reasonDoc = await ReasonRepository.findByKey(reasonRaw.toLowerCase());
        if (reasonDoc) {
            reasonKey = reasonDoc.key;
            reason = reasonDoc.label;
            reasonAr = reasonDoc.labelAr;
        }

        const modLevel = getMemberLevel(modMember);
        const needsApproval = modLevel.score <= 20;

        if (type === "warn") {
            if (needsApproval) {
                const approvalEmbed = new EmbedBuilder()
                    .setTitle("⚠️ Warning Approval Required")
                    .setColor(Colors.warning)
                    .addFields(
                        { name: "Target", value: `<@${targetId}>`, inline: true },
                        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Reason", value: reason },
                        { name: "Type", value: "Warning", inline: true },
                    )
                    .setTimestamp();

                const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`punish_approve_warn_${targetId}_${reasonKey}_${interaction.user.id}`)
                        .setLabel("Approve")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("✅"),
                    new ButtonBuilder()
                        .setCustomId(`punish_deny_warn_${targetId}_${reasonKey}_${interaction.user.id}`)
                        .setLabel("Deny")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("❌"),
                );

                const approvalChannel = interaction.guild?.channels.cache.get(data.punishments_case_channel_id) as TextChannel | undefined;
                if (approvalChannel) {
                    await approvalChannel.send({ embeds: [approvalEmbed], components: [buttons] });
                }

                await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription("⏳ Your warning request has been sent for approval.").setColor(Colors.info)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await executeWarn(client, guildId, targetId, targetUser.username, reason, reasonAr, interaction.user.id, targetMember);
            await interaction.reply({ embeds: [result.embed] });
        } else if (type === "mute") {
            let durationHours = 24;
            const durationInput = interaction.fields.getTextInputValue("duration");
            if (durationInput && !isNaN(Number(durationInput))) {
                durationHours = Number(durationInput);
            }
            const durationMs = durationHours * 60 * 60 * 1000;

            if (needsApproval) {
                const approvalEmbed = new EmbedBuilder()
                    .setTitle("🔇 Mute Approval Required")
                    .setColor(Colors.moderation)
                    .addFields(
                        { name: "Target", value: `<@${targetId}>`, inline: true },
                        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Reason", value: reason },
                        { name: "Duration", value: `${durationHours} hour(s)`, inline: true },
                        { name: "Type", value: "Mute", inline: true },
                    )
                    .setTimestamp();

                const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`punish_approve_mute_${targetId}_${reasonKey}_${interaction.user.id}_${durationHours}`)
                        .setLabel("Approve")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("✅"),
                    new ButtonBuilder()
                        .setCustomId(`punish_deny_mute_${targetId}_${reasonKey}_${interaction.user.id}`)
                        .setLabel("Deny")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("❌"),
                );

                const approvalChannel = interaction.guild?.channels.cache.get(data.punishments_case_channel_id) as TextChannel | undefined;
                if (approvalChannel) {
                    await approvalChannel.send({ embeds: [approvalEmbed], components: [buttons] });
                }

                await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription("⏳ Your mute request has been sent for approval.").setColor(Colors.info)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await executeMute(client, guildId, targetId, targetUser.username, reason, reasonAr, interaction.user.id, targetMember, durationMs, interaction.guild!);
            await interaction.reply({ embeds: [result.embed] });
        } else if (type === "ban") {
            const durationInput = interaction.fields.getTextInputValue("duration")?.toLowerCase() || "perm";
            const permanent = durationInput === "perm";
            let durationDays = 0;
            if (!permanent && !isNaN(Number(durationInput))) {
                durationDays = Number(durationInput);
            }

            if (needsApproval) {
                const approvalEmbed = new EmbedBuilder()
                    .setTitle("🔨 Ban Approval Required")
                    .setColor(Colors.moderation)
                    .addFields(
                        { name: "Target", value: `<@${targetId}>`, inline: true },
                        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Reason", value: reason },
                        { name: "Type", value: permanent ? "Permanent Ban" : `Temp Ban (${durationDays} days)`, inline: true },
                    )
                    .setTimestamp();

                const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`punish_approve_ban_${targetId}_${reasonKey}_${interaction.user.id}_${permanent ? "perm" : durationDays}`)
                        .setLabel("Approve")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("✅"),
                    new ButtonBuilder()
                        .setCustomId(`punish_deny_ban_${targetId}_${reasonKey}_${interaction.user.id}`)
                        .setLabel("Deny")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("❌"),
                );

                const approvalChannel = interaction.guild?.channels.cache.get(data.punishments_case_channel_id) as TextChannel | undefined;
                if (approvalChannel) {
                    await approvalChannel.send({ embeds: [approvalEmbed], components: [buttons] });
                }

                await interaction.reply({
                    embeds: [new EmbedBuilder().setDescription("⏳ Your ban request has been sent for approval.").setColor(Colors.info)],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const result = await executeBan(client, guildId, targetId, targetUser.username, reason, reasonAr, interaction.user.id, targetMember, permanent, durationDays, interaction.guild!);
            await interaction.reply({ embeds: [result.embed] });
        }
    }
};
