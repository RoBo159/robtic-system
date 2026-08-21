import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    MessageFlags,
    ChannelType,
    type SlashCommandSubcommandBuilder,
    type GuildTextBasedChannel,
} from "discord.js";
import { ChatUtils } from "@bot/utils/moderation/chat";
import { STAFF_TIER_THRESHOLDS, CHAT_MESSAGES } from "@constants";
import { BRANCH_EMOJIS as emoji } from "@config";

/**
 * Every subcommand takes the same optional target, so `/chat lock #general` and the `l #general`
 * shortcut form accept the same thing. They diverged before: the shortcut grammar could name a
 * channel and the slash command could not, which made one usage line wrong whichever form help
 * chose to print.
 */
const withChannel = (sub: SlashCommandSubcommandBuilder) =>
    sub.addChannelOption(opt =>
        opt.setName("channel")
            .setDescription("Channel to act on. Defaults to this one.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
    );

export default {
    scope: "guild",
    category: "Moderation",
    data: new SlashCommandBuilder()
        .setName("chat")
        .setDescription("Manage channel chat settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            withChannel(sub.setName("lock")
                .setDescription("Lock a channel so members cannot send messages."))
        )
        .addSubcommand(sub =>
            withChannel(sub.setName("unlock")
                .setDescription("Unlock a channel."))
        )
        .addSubcommand(sub =>
            withChannel(sub.setName("hide")
                .setDescription("Hide a channel so members cannot see it."))
        )
        .addSubcommand(sub =>
            withChannel(sub.setName("show")
                .setDescription("Show a channel."))
        )
        .addSubcommand(sub =>
            withChannel(sub.setName("slowmode")
                .setDescription("Set slowmode for a channel.")
                .addStringOption(opt =>
                    opt.setName("duration")
                        .setDescription("Duration (e.g. 5s, 1m, 1h) or 0 to disable")
                        .setRequired(true)
                ))
        )
        .addSubcommand(sub =>
            withChannel(sub.setName("clear")
                .setDescription("Clear recent messages in a channel.")
                .addIntegerOption(opt =>
                    opt.setName("amount")
                        .setDescription("Number of messages to delete (max 100). Default 100.")
                        .setMinValue(1)
                        .setMaxValue(100)
                ))
        ),

    requiredPermission: STAFF_TIER_THRESHOLDS.staff,

    async run(interaction: ChatInputCommandInteraction) {
        if (!interaction.guild || !interaction.channel) {
            await interaction.reply({ content: CHAT_MESSAGES.guildChannelOnly, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;

        const named = interaction.options.getChannel("channel");
        const channel = (named ?? interaction.channel) as GuildTextBasedChannel;

        let msg: string | null = null;

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
                    msg = await ChatUtils.slowmode(channel, interaction.options.getString("duration", true));
                    break;
                case "clear":
                    msg = await ChatUtils.clear(channel, interaction.options.getInteger("amount") || 100);
                    break;
            }

            if (msg) {
                await interaction.editReply({ content: `${emoji.info} ${msg}` }).then(() => {
                    if (subcommand === "clear") {
                        setTimeout(() => {
                            interaction.deleteReply().catch(() => { });
                        }, 5000);
                    }
                });
            } else {
                await interaction.deleteReply().catch(() => { });
                await interaction.followUp({ content: `${emoji.info} ${CHAT_MESSAGES.unknownSubcommand}`, flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            console.error(error);
            await interaction.deleteReply().catch(() => { });
            await interaction.followUp({ content: CHAT_MESSAGES.actionFailed, flags: MessageFlags.Ephemeral });
        }
    }
};
