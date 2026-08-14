import { EmbedBuilder, MessageFlags, type ButtonInteraction } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import type { BotClient } from "@core/bot-client";
import { StreakRepository } from "@database/repositories";
import { COLORS } from "@constants";
import { applyStreakRole } from "../utils/streak-role";

export const streakSyncConfirmHandler: ComponentHandler<ButtonInteraction> = {
    customId: /^streak-sync-(confirm|cancel)_(\d+)(?:_(\d+))?$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const match = /^streak-sync-(confirm|cancel)_(\d+)(?:_(\d+))?$/.exec(interaction.customId);
        const [, action, initiatorId, sourceGuildId] = match ?? [];

        if (interaction.user.id !== initiatorId) {
            await interaction.reply({ content: "هذا الزر ليس لك.", flags: MessageFlags.Ephemeral });
            return;
        }

        if (action === "cancel") {
            await interaction.update({ content: "تم إلغاء المزامنة.", embeds: [], components: [] });
            return;
        }

        await interaction.update({ content: "⏳ جارٍ المزامنة...", embeds: [], components: [] });

        const destGuild = interaction.guild;
        if (!destGuild || !sourceGuildId) {
            await interaction.editReply({ content: "حدث خطأ أثناء المزامنة." });
            return;
        }

        const synced = await StreakRepository.bulkSyncFromGuild(sourceGuildId, destGuild.id);

        let rolesApplied = 0;
        for (const record of synced) {
            const member = await destGuild.members.fetch(record.discordId).catch(() => null);
            if (!member) continue;
            await applyStreakRole(member, record.currentStreak).catch(() => null);
            rolesApplied++;
        }

        await interaction.editReply({
            content: "",
            embeds: [new EmbedBuilder()
                .setTitle("✅ تمت المزامنة")
                .setColor(COLORS.success)
                .setDescription(`تمت مزامنة **${synced.length}** تتابع، وتحديث الأدوار لـ **${rolesApplied}** عضو موجود في هذا السيرفر.`)],
        });
    },
};
