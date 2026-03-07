import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/BotClient";
import { hasDepartmentAuthority } from "@shared/utils/access";
import messages from "../utils/messages.json";

export default {
    data: new SlashCommandBuilder()
        .setName("transfer")
        .setDescription("Transfer this modmail thread to another staff member")
        .addUserOption(opt =>
            opt.setName("staff").setDescription("The staff member to transfer to").setRequired(true)
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        if (!interaction.channel?.isThread()) {
            await interaction.reply({
                content: messages.errors.not_in_thread,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const modmail = await ModMailRepository.findByThreadId(interaction.channel.id);
        if (!modmail || modmail.status !== "open") {
            await interaction.reply({
                content: messages.errors.no_active_thread,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const member = interaction.member as GuildMember;
        const isDeptAuthority = hasDepartmentAuthority(member, "Moderation");

        if (modmail.claimedBy !== interaction.user.id && !isDeptAuthority) {
            await interaction.reply({
                content: messages.errors.only_handler_can_transfer,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const target = interaction.options.getUser("staff", true);

        if (target.bot) {
            await interaction.reply({
                content: messages.errors.cannot_transfer_bot,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (target.id === modmail.claimedBy) {
            await interaction.reply({
                content: messages.errors.already_owns_thread,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await ModMailRepository.transfer(interaction.channel.id, target.id);

        await interaction.reply({
            content: messages.success.thread_transferred.replace("{targetId}", target.id).replace("{userId}", interaction.user.id),
        });
    },
};
