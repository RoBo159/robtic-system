import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { getCoinSummary } from "@core/coins";
import { UserRepository } from "@database/repositories";

export default {
    category: "Economy",
    data: new SlashCommandBuilder()
        .setName("coins")
        .setDescription("See how many coins you (or another member) have earned")
        .addUserOption(opt =>
            opt.setName("user").setDescription("The member to check (defaults to yourself)").setRequired(false)
        ),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const target = interaction.options.getUser("user") ?? interaction.user;
        const summary = await getCoinSummary(interaction.guildId, target.id);
        const displayName = await UserRepository.getDisplayName(target.id) ?? target.username;

        const streakLines = summary.rates.streakRewards.length > 0
            ? summary.rates.streakRewards
                .slice()
                .sort((a, b) => a.streak - b.streak)
                .map(r => `🔥 ${r.streak}-day streak → +${r.coins}`)
                .join("\n")
            : "None configured";

        const embed = new EmbedBuilder()
            .setTitle(`🪙 Coins — ${displayName}`)
            .setThumbnail(target.displayAvatarURL({ size: 128 }))
            .addFields(
                { name: "Balance", value: `**${summary.coins}** 🪙`, inline: true },
                { name: "Rank", value: summary.rank > 0 ? `#${summary.rank}` : "—", inline: true },
                { name: "​", value: "​", inline: true },
                {
                    name: "Next coin progress",
                    value:
                        `📨 Messages: \`${summary.messageProgress}/${summary.rates.messagesPerCoin}\`\n` +
                        `💬 Combo score: \`${summary.comboProgress}/${summary.rates.comboPerCoin}\``,
                },
                { name: "Streak payouts", value: streakLines },
            )
            .setColor(COLORS.activity)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
