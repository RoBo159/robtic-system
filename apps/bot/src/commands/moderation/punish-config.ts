import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ChannelType,
    EmbedBuilder,
    type GuildMember,
} from "discord.js";
import { COLORS } from "@constants";
import { errorEmbed } from "@utils";
import { getMemberLevel, isManagerOf } from "@bot/utils/access";
import { PunishConfigRepository } from "@database/repositories";

async function managerOnly(member: GuildMember): Promise<boolean> {
    const { score } = await getMemberLevel(member);
    if (score >= 90) return true;
    return isManagerOf(member, "Moderation");
}

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("punish-config")
        .setDescription("Configure ban/mute/warn shortcuts, proof channel, and moderation points")
        .addSubcommand(sub =>
            sub.setName("role-add")
                .setDescription("Allow a role to use ban/mute/warn shortcuts")
                .addRoleOption(opt => opt.setName("role").setDescription("Role to allow").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("role-remove")
                .setDescription("Remove a role's shortcut access")
                .addRoleOption(opt => opt.setName("role").setDescription("Role to remove").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("role-list")
                .setDescription("List roles allowed to use punishment shortcuts")
        )
        .addSubcommand(sub =>
            sub.setName("points-set")
                .setDescription("Set how many staff points a warn/mute awards the moderator")
                .addIntegerOption(opt => opt.setName("amount").setDescription("Points per action").setRequired(true).setMinValue(0))
        )
        .addSubcommand(sub =>
            sub.setName("proof-channel-set")
                .setDescription("Set the channel where proof/evidence images are posted")
                .addChannelOption(opt =>
                    opt.setName("channel")
                        .setDescription("Proof channel")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand(sub =>
            sub.setName("status")
                .setDescription("Show current punish-config settings")
        ),

    requiredPermission: 80,
    department: "Moderation" as Department,

    async run(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) return;
        await interaction.deferReply();

        const member = interaction.member as GuildMember;
        if (!(await managerOnly(member))) {
            await interaction.editReply({ embeds: [errorEmbed("Only Moderation Department Managers can use this command.")] });
            return;
        }

        const guildId = interaction.guildId;
        const sub = interaction.options.getSubcommand();

        if (sub === "role-add") {
            const role = interaction.options.getRole("role", true);
            await PunishConfigRepository.addShortcutRole(guildId, role.id);
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(`Added <@&${role.id}> to punishment shortcut roles.`)],
            });
            return;
        }

        if (sub === "role-remove") {
            const role = interaction.options.getRole("role", true);
            await PunishConfigRepository.removeShortcutRole(guildId, role.id);
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(`Removed <@&${role.id}> from punishment shortcut roles.`)],
            });
            return;
        }

        if (sub === "points-set") {
            const amount = interaction.options.getInteger("amount", true);
            await PunishConfigRepository.setPointsPerAction(guildId, amount);
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(`Warn/mute now awards **${amount}** point(s) to the moderator.`)],
            });
            return;
        }

        if (sub === "proof-channel-set") {
            const channel = interaction.options.getChannel("channel", true);
            await PunishConfigRepository.setProofChannel(guildId, channel.id);
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription(`Proof channel set to <#${channel.id}>.`)],
            });
            return;
        }

        // sub === "role-list" || sub === "status"
        const config = await PunishConfigRepository.findOrCreate(guildId);
        const embed = new EmbedBuilder()
            .setTitle("🔧 Punish Config")
            .setColor(COLORS.info)
            .addFields(
                { name: "Shortcut Roles", value: config.shortcutRoleIds.length ? config.shortcutRoleIds.map(id => `<@&${id}>`).join(", ") : "None" },
                { name: "Points per warn/mute", value: `${config.pointsPerAction}`, inline: true },
                { name: "Proof Channel", value: config.proofChannelId ? `<#${config.proofChannelId}>` : "Not set", inline: true },
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
