import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    type GuildTextBasedChannel,
} from "discord.js";
import { ChatUtils } from "../utils/chat";
import emoji from "@shared/emojis.json";

export default {
    data: new SlashCommandBuilder()
        .setName("chat")
        .setDescription("Manage channel chat settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName("lock")
                .setDescription("Lock the current channel so members cannot send messages.")
        )
        .addSubcommand(sub =>
            sub.setName("unlock")
                .setDescription("Unlock the current channel.")
        )
        .addSubcommand(sub =>
            sub.setName("hide")
                .setDescription("Hide the current channel so members cannot see it.")
        )
        .addSubcommand(sub =>
            sub.setName("show")
                .setDescription("Show the current channel.")
        )
        .addSubcommand(sub =>
            sub.setName("slowmode")
                .setDescription("Set slowmode for the channel.")
                .addStringOption(opt =>
                    opt.setName("duration")
                        .setDescription("Duration (e.g. 5s, 1m, 1h) or 0 to disable")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("clear")
                .setDescription("Clear recent messages in the channel.")
                .addIntegerOption(opt =>
                    opt.setName("amount")
                        .setDescription("Number of messages to delete (max 100). Default 100.")
                        .setMinValue(1)
                        .setMaxValue(100)
                )
        ),

    async run(interaction: ChatInputCommandInteraction) {
        if (!interaction.guild || !interaction.channel) {
            await interaction.reply({ content: "This command can only be used in a server channel.", ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const channel = interaction.channel as GuildTextBasedChannel;
        const guild = interaction.guild;

        let msg: String | null = null;

        try {
            switch (subcommand) {
                case "lock":
                    msg = await ChatUtils.lock(channel, guild);
                    break;
                case "unlock":
                    msg = await ChatUtils.unlock(channel, guild);
                    break;
                case "hide":
                    msg = await ChatUtils.hide(channel, guild);
                    break;
                case "show":
                    msg = await ChatUtils.show(channel, guild);
                    break;
                case "slowmode":
                    const duration = interaction.options.getString("duration", true);
                    msg = await ChatUtils.slowmode(channel, duration);
                    break;
                case "clear":
                    const amount = interaction.options.getInteger("amount") || 100;
                    msg = await ChatUtils.clear(channel, amount);
                    break;
            }

            if (msg) {
                await interaction.reply({ content: `${emoji.info} ${msg}` }).then(() => {
                    if (subcommand === "clear") {
                        setTimeout(() => {
                            interaction.deleteReply().catch(() => { });
                        }, 5000);
                    }
                });
            } else {
                await interaction.reply({ content: `${emoji.info} Unknown subcommand.`, ephemeral: true });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: "An error occurred while executing the command. Please check my permissions.",
                ephemeral: true
            });
        }
    }
};
