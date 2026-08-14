import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
} from "discord.js";
import { ActivityRepository } from "@database/repositories";
import { COLORS } from "@constants";
import { calculateLevel, xpForLevel } from "@bot/services/community/xp";

export default {
    scope: "guild",
    access: "general",
    category: "Leveling",
    data: new SlashCommandBuilder()
        .setName("level")
        .setDescription("Check your level and XP")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("User to check (defaults to you)")
        ),

    async run(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();

        const target = interaction.options.getUser("user") ?? interaction.user;
        const guildId = interaction.guildId!;

        const record = await ActivityRepository.findOrCreate(target.id, guildId, target.username);
        const rank = await ActivityRepository.getRank(target.id, guildId);
        const currentLevel = calculateLevel(record.totalXP);
        const nextLevelXP = xpForLevel(currentLevel + 1);
        const progress = record.totalXP - xpForLevel(currentLevel);
        const needed = nextLevelXP - xpForLevel(currentLevel);

        const progressBar = generateBar(progress, needed);

        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Level`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: "Level", value: `${currentLevel}`, inline: true },
                { name: "Total XP", value: `${record.totalXP}`, inline: true },
                { name: "Rank", value: `#${rank}`, inline: true },
                { name: "Messages", value: `${record.messageCount}`, inline: true },
                { name: "Progress", value: `${progressBar} ${progress}/${needed}`, inline: false },
            )
            .setColor(COLORS.activity)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

function generateBar(current: number, max: number): string {
    const total = 10;
    const filled = Math.round((current / max) * total);
    return "█".repeat(filled) + "░".repeat(total - filled);
}
