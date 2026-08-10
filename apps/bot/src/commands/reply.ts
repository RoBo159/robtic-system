import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags,
} from "discord.js";
import { ReplyRepository } from "@database/repositories/ReplyRepository";
import { COLORS } from "@constants";

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("reply")
        .setDescription("Manage auto-replies for messages")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("Add or update an auto-reply for a message trigger")
                .addStringOption(opt =>
                    opt.setName("msg")
                        .setDescription("The message to trigger the reply")
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("reply")
                        .setDescription("The reply to add (can add multiple)")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("delete")
                .setDescription("Delete a reply for a message trigger")
                .addStringOption(opt =>
                    opt.setName("msg")
                        .setDescription("The message trigger to delete a reply from")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("setting")
                .setDescription("Configure reply settings for a message trigger")
                .addStringOption(opt =>
                    opt.setName("msg")
                        .setDescription("The message trigger to configure")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    async autocomplete(interaction: AutocompleteInteraction) {
        const focused = interaction.options.getFocused(true);
        if (focused.name === "msg") {
            const triggers = await ReplyRepository.getAllTriggers(interaction.guildId!);
            const items = triggers.filter(t => t.toLowerCase().startsWith(focused.value.toLowerCase()));
            await interaction.respond(items.map(t => ({ name: t, value: t })));
        }
    },

    async run(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (sub === "add") {
            const msg = interaction.options.getString("msg", true);
            const reply = interaction.options.getString("reply", true);
            await ReplyRepository.addReply(guildId, msg, reply);
            await interaction.editReply({ content: `Reply added for trigger: "${msg}".` });
            return;
        } else if (sub === "delete") {
            const msg = interaction.options.getString("msg", true);
            const deleted = await ReplyRepository.deleteReply(guildId, msg);
            if (!deleted) {
                await interaction.editReply({ content: `No reply found for trigger: "${msg}".` });
                return;
            }
            await interaction.editReply({ content: `Reply deleted for trigger: "${msg}".` });
            return;
        } else if (sub === "setting") {
            const msg = interaction.options.getString("msg", true);
            const replyData = await ReplyRepository.getReply(guildId, msg);
            if (!replyData) {
                await interaction.editReply({ content: `No reply found for trigger: "${msg}".` });
                return;
            }
            const embed = new EmbedBuilder()
                .setTitle(`Reply Settings for: ${msg}`)
                .setDescription(`Current replies: ${replyData.replies.map((r: string) => `• ${r}`).join("\n")}`)
                .setColor(COLORS.info || 0x3498DB);
            // Add more fields for special channels/roles/blocklist if needed
            await interaction.editReply({ embeds: [embed] });
        }
    }
};
