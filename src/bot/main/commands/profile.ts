import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { Colors, MembersPunishments } from "@core/config";
import { PunishmentRepository, NoteRepository, ActivityRepository } from "@database/repositories";
import { getMemberLevel, isStaff } from "@shared/utils/access";
import { calculateLevel, xpForLevel } from "../../community/services/xp-service";
import { getStaffActivity, getSupportStats } from "@shared/utils/staff-activity";

export default {
    data: new SlashCommandBuilder()
        .setName("profile")
        .setDescription("View a user's profile and information")
        .addUserOption(opt =>
            opt.setName("user").setDescription("The user to view (defaults to yourself)").setRequired(false)
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const target = interaction.options.getUser("user") ?? interaction.user;
        const guildId = interaction.guildId!;
        const member = interaction.guild?.members.cache.get(target.id) ?? await interaction.guild?.members.fetch(target.id).catch(() => null);
        const currentUser = interaction.guild?.members.cache.get(interaction.user.id) ?? await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);

        if(target !== interaction.user && isStaff(member as GuildMember) && !isStaff(currentUser as GuildMember)) return await interaction.reply({ content: "You cannot view the profile of another staff member.", flags: MessageFlags.Ephemeral });  

        const punishmentLevel = await PunishmentRepository.getPunishmentLevel(target.id);
        const levelInfo = PunishmentRepository.getLevelInfo(punishmentLevel);
        const allPunishments = await PunishmentRepository.findByUser(target.id, guildId);
        const activePunishments = allPunishments.filter(p => p.active && !p.appealed);
        const notes = await NoteRepository.findByUser(target.id);

        const staffLevel = member ? getMemberLevel(member) : null;
        const memberIsStaff = member ? isStaff(member) : false;
        const roles = member?.roles.cache
            .filter(r => r.id !== guildId)
            .sort((a, b) => b.position - a.position)
            .map(r => `<@&${r.id}>`)
            .slice(0, 15)
            .join(", ") || "None";

        const levelBar = buildLevelBar(punishmentLevel);

        const xpRecord = await ActivityRepository.findOrCreate(target.id, guildId, target.username);
        const xpLevel = calculateLevel(xpRecord.totalXP);
        const nextLevelXP = xpForLevel(xpLevel + 1);
        const progress = xpRecord.totalXP - xpForLevel(xpLevel);
        const needed = nextLevelXP - xpForLevel(xpLevel);
        const xpBar = buildXPBar(progress, needed);
        const rank = await ActivityRepository.getRank(target.id, guildId);

        const embed = new EmbedBuilder()
            .setTitle(`👤 Profile — ${target.username}`)
            .setThumbnail(target.displayAvatarURL({ size: 256 }))
            .setColor(punishmentLevel >= 60 ? Colors.moderation : punishmentLevel >= 20 ? Colors.warning : Colors.info)
            .addFields(
                { name: "User", value: `<@${target.id}>`, inline: true },
                { name: "ID", value: `\`${target.id}\``, inline: true },
                { name: "Account Created", value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
                ...(member ? [{ name: "Joined Server", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Unknown", inline: true }] : []),
                ...(staffLevel && staffLevel.level !== "Member" ? [{ name: "Staff Level", value: `${staffLevel.level} (${staffLevel.score})`, inline: true }] : []),
                { name: "Roles", value: roles.length > 200 ? roles.slice(0, 200) + "..." : roles },
                { name: "XP Level", value: `Level **${xpLevel}** — Rank #${rank}\n${xpBar} \`${progress}/${needed}\` XP`, inline: false },
                { name: "Messages", value: `${xpRecord.messageCount}`, inline: true },
                { name: "Total XP", value: `${xpRecord.totalXP}`, inline: true },
            );

        if (memberIsStaff) {
            const staffData = await getStaffActivity(target.id, guildId);
            const supportStats = await getSupportStats(target.id);
            const avgResponse = supportStats.avgResponseMs > 0 ? `${Math.round(supportStats.avgResponseMs / 1000)}s` : "N/A";

            embed.addFields(
                { name: "\u200b", value: "**── Staff Activity ──**" },
                { name: "Support Points", value: `${staffData.supportPoints}`, inline: true },
                { name: "Public Chat Points", value: `${staffData.publicChatPoints}`, inline: true },
                { name: "Staff Chat Points", value: `${staffData.staffChatPoints}`, inline: true },
                { name: "Penalties", value: `${staffData.penalties}`, inline: true },
                { name: "Total Staff Points", value: `**${staffData.totalStaffPoints}**`, inline: true },
                { name: "Avg Response Time", value: avgResponse, inline: true },
                { name: "Sessions Resolved", value: `${supportStats.totalResolved}/${supportStats.totalClaimed}`, inline: true },
            );
        }

        embed.addFields(
            { name: "\u200b", value: "**── Moderation ──**" },
            { name: "Punishment Level", value: `${levelBar}\n\`${punishmentLevel}/100\` — **${levelInfo.name}**` },
            { name: "Active Punishments", value: `${activePunishments.length}`, inline: true },
            { name: "Total Records", value: `${allPunishments.length}`, inline: true },
            { name: "Notes", value: `${notes.length}`, inline: true },
        ).setTimestamp();

        const menuOptions = [
            { label: "Activity", description: "View XP activity and recent logs", value: "activity", emoji: "📊" },
            ...(memberIsStaff ? [{ label: "Staff Activity", description: "View detailed staff points breakdown", value: "staff_activity", emoji: "🏆" }] : []),
            { label: "Notes", description: "View all notes for this user", value: "notes", emoji: "📝" },
            { label: "Punishment History", description: "View full punishment history", value: "history", emoji: "📋" },
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`profile_menu_${target.id}`)
            .setPlaceholder("View more details...")
            .addOptions(menuOptions);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    },
};

function buildLevelBar(level: number): string {
    const total = 20;
    const filled = Math.round((level / 100) * total);
    const empty = total - filled;
    const filledChar = level >= 80 ? "🟥" : level >= 60 ? "🟧" : level >= 40 ? "🟨" : level >= 20 ? "🟩" : "⬜";
    return filledChar.repeat(filled) + "⬛".repeat(empty);
}

function buildXPBar(current: number, max: number): string {
    const total = 10;
    const filled = max > 0 ? Math.round((current / max) * total) : 0;
    return "█".repeat(filled) + "░".repeat(total - filled);
}
