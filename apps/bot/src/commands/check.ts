import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, CHECK_MESSAGES, CHECK_RESULT_LIMIT } from "@constants";
import { ActivityRepository, StreakRepository } from "@database/repositories";
import { isGuildOperator, isStaff } from "@bot/utils/access";
import { getStaffActivity, getSupportStats } from "@bot/utils/staff-activity";

/** Administrators (and whitelisted super users, via isGuildOperator) may run bulk member lookups. */
function isAllowed(member: GuildMember): boolean {
    return isGuildOperator(member) || member.permissions.has(PermissionFlagsBits.Administrator);
}

export default {
    category: "Admin",
    data: new SlashCommandBuilder()
        .setName("check")
        .setDescription("Look up members by a stat value (admin only)")
        .addSubcommand(sub =>
            sub.setName("streak")
                .setDescription("List every member currently on an exact streak")
                .addIntegerOption(opt =>
                    opt.setName("value")
                        .setDescription("The streak day-count to match (e.g. 5)")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub.setName("staff")
                .setDescription("Staff activity report built from the stored staff data")
                .addUserOption(opt =>
                    opt.setName("user")
                        .setDescription("One staff member to inspect; omit for the full overview")
                )
        ),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const member = interaction.member as GuildMember | null;
        if (!member || !interaction.guildId) {
            await interaction.reply({ content: CHECK_MESSAGES.guildOnly, flags: MessageFlags.Ephemeral });
            return;
        }

        if (!isAllowed(member)) {
            await interaction.reply({ content: CHECK_MESSAGES.adminOnly, flags: MessageFlags.Ephemeral });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "streak") {
            await runStreakCheck(interaction, interaction.guildId);
            return;
        }

        if (subcommand === "staff") {
            await runStaffCheck(interaction, interaction.guildId);
        }
    },
};

async function runStreakCheck(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
    const value = interaction.options.getInteger("value", true);
    if (!Number.isInteger(value) || value < 1) {
        await interaction.reply({ content: CHECK_MESSAGES.invalidValue, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const records = await StreakRepository.findByCurrentStreak(guildId, value);

    if (records.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription(CHECK_MESSAGES.streakNone(value))],
        });
        return;
    }

    const shown = records.slice(0, CHECK_RESULT_LIMIT);
    const lines = shown.map((record, index) => CHECK_MESSAGES.streakLine(index + 1, record.discordId));

    let description = `${CHECK_MESSAGES.streakSummary(records.length, value)}\n\n${lines.join("\n")}`;
    if (records.length > shown.length) {
        description += CHECK_MESSAGES.truncatedNote(shown.length, records.length);
    }

    const embed = new EmbedBuilder()
        .setTitle(CHECK_MESSAGES.streakTitle(value))
        .setDescription(description)
        .setColor(COLORS.activity)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function runStaffCheck(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
    const targetUser = interaction.options.getUser("user");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (targetUser) {
        await runStaffUserCheck(interaction, guildId, targetUser.id, targetUser.username);
        return;
    }

    const records = await ActivityRepository.getStaffActivityOverview(guildId, CHECK_RESULT_LIMIT);

    if (records.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription(CHECK_MESSAGES.staffNone)],
        });
        return;
    }

    const lines = records.map((record, index) =>
        CHECK_MESSAGES.staffLine(index + 1, record.discordId, record.totalStaffPoints, record.staff),
    );

    const embed = new EmbedBuilder()
        .setTitle(CHECK_MESSAGES.staffTitle)
        .setDescription(`${CHECK_MESSAGES.staffSummary(records.length)}\n\n${lines.join("\n")}`.slice(0, 4096))
        .setColor(COLORS.default)
        .setFooter({ text: CHECK_MESSAGES.staffLegend })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function runStaffUserCheck(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    targetId: string,
    username: string,
): Promise<void> {
    const guildMember = interaction.guild?.members.cache.get(targetId)
        ?? await interaction.guild?.members.fetch(targetId).catch(() => null);

    if (!guildMember) {
        await interaction.editReply({ content: CHECK_MESSAGES.staffMemberNotFound });
        return;
    }

    if (!(await isStaff(guildMember))) {
        await interaction.editReply({ content: CHECK_MESSAGES.staffNotStaff(targetId) });
        return;
    }

    const staffData = await getStaffActivity(targetId, guildId);
    const supportStats = await getSupportStats(targetId);
    const avgResponse = supportStats.avgResponseMs > 0 ? `${Math.round(supportStats.avgResponseMs / 1000)}s` : "N/A";

    const embed = new EmbedBuilder()
        .setTitle(CHECK_MESSAGES.staffUserTitle(username))
        .addFields(
            { name: "Support Points", value: `${staffData.supportPoints}`, inline: true },
            { name: "Public Chat Points", value: `${staffData.publicChatPoints}`, inline: true },
            { name: "Staff Chat Points", value: `${staffData.staffChatPoints}`, inline: true },
            { name: "Moderation Points", value: `${staffData.moderationPoints}`, inline: true },
            { name: "Penalties", value: `${staffData.penalties}`, inline: true },
            { name: "Total Staff Points", value: `**${staffData.totalStaffPoints}**`, inline: true },
            { name: "Sessions Claimed", value: `${supportStats.totalClaimed}`, inline: true },
            { name: "Sessions Resolved", value: `${supportStats.totalResolved}`, inline: true },
            { name: "Avg Response Time", value: avgResponse, inline: true },
        )
        .setColor(COLORS.default)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
