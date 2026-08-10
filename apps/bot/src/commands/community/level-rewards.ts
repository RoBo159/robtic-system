import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { LevelRewardRepository } from "@database/repositories";
import { COLORS } from "@constants";

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("level-rewards")
        .setDescription("Manage level reward roles")

        .addSubcommand(sub =>
            sub
                .setName("set")
                .setDescription("Set a role reward for a level")
                .addIntegerOption(opt =>
                    opt.setName("level").setDescription("Level to reward at").setMinValue(1).setRequired(true)
                )
                .addRoleOption(opt =>
                    opt.setName("role").setDescription("Role to grant").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("remove")
                .setDescription("Remove a level reward")
                .addIntegerOption(opt =>
                    opt.setName("level").setDescription("Level to remove reward from").setMinValue(1).setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("list")
                .setDescription("List all level rewards")
        ),

    requiredPermission: 80,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildId = interaction.guildId!;
        const sub = interaction.options.getSubcommand();

        if (sub === "set") {
            const level = interaction.options.getInteger("level", true);
            const role = interaction.options.getRole("role", true);

            await LevelRewardRepository.set(guildId, level, role.id);
            await interaction.editReply({
                content: `Level **${level}** will now grant <@&${role.id}>.`,
            });
        }

        else if (sub === "remove") {
            const level = interaction.options.getInteger("level", true);
            const removed = await LevelRewardRepository.remove(guildId, level);

            await interaction.editReply({
                content: removed
                    ? `Removed reward for level **${level}**.`
                    : `No reward found for level **${level}**.`,
            });
        }

        else if (sub === "list") {
            const rewards = await LevelRewardRepository.getAll(guildId);

            if (rewards.length === 0) {
                await interaction.editReply({ content: "No level rewards configured." });
                return;
            }

            const lines = rewards.map(r => `Level **${r.level}** → <@&${r.roleId}>`);

            const embed = new EmbedBuilder()
                .setTitle("Level Rewards")
                .setDescription(lines.join("\n"))
                .setColor(COLORS.activity)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
