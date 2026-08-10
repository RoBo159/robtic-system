import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { StaffRepository } from "@database/repositories";
import { hasDepartmentAuthority, hasFullPower } from "@bot/utils/access";
import { moveStaffTier, categoryLabel } from "../../utils/hr/staff-promotion";

export default {
    category: "Staff",
    data: new SlashCommandBuilder()
        .setName("promote")
        .setDescription("ترقية موظف رتبة واحدة")
        .addStringOption(opt =>
            opt.setName("target").setDescription("الموظف المراد ترقيته").setRequired(true).setAutocomplete(true)
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        if (!interaction.guildId || !interaction.guild) return;

        const targetId = interaction.options.getString("target", true);
        const staffRecord = await StaffRepository.findByDiscordId(targetId);
        if (!staffRecord) {
            await interaction.reply({ content: "❌ | هذا العضو ليس موظفًا مسجلًا.", flags: MessageFlags.Ephemeral });
            return;
        }

        const actingMember = interaction.member as GuildMember;
        if (!(await hasDepartmentAuthority(actingMember, staffRecord.department)) && !hasFullPower(actingMember)) {
            await interaction.reply({ content: "❌ | ليست لديك صلاحية ترقية موظفي هذا القسم.", flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply();

        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!targetMember) {
            await interaction.editReply({ content: "❌ | لم أتمكن من العثور على هذا العضو في السيرفر." });
            return;
        }

        const result = await moveStaffTier(interaction.guild, targetMember, staffRecord.department, "up");

        if (!result.ok) {
            const messages = {
                "no-ladder": "❌ | لم يتم إعداد رتب هذا القسم بعد. استخدم `/staff-tier set-category` أولًا.",
                "at-top": "❌ | هذا الموظف بالفعل في أعلى رتبة لهذا القسم.",
                "at-bottom": "❌ | تعذّرت الترقية.",
            };
            await interaction.editReply({ content: messages[result.reason] });
            return;
        }

        await StaffRepository.createPromotion({
            staffId: targetId,
            discordId: targetId,
            previousPosition: result.previousTierName,
            newPosition: result.newTierName,
            previousDepartment: staffRecord.department,
            newDepartment: staffRecord.department,
            type: "promotion",
            reason: "-",
            approvedBy: interaction.user.id,
        });

        const prevCategory = categoryLabel(result.previousScore);
        const newCategory = categoryLabel(result.newScore);
        const crossedCategory = prevCategory !== newCategory;

        const embed = new EmbedBuilder()
            .setTitle("✅ تمت الترقية")
            .setColor(COLORS.success)
            .setDescription(
                `تمت ترقية <@${targetId}> من **${result.previousTierName}** إلى **${result.newTierName}**.` +
                (crossedCategory ? `\n\nأصبح الآن **${newCategory}** وحصل على صلاحيات جديدة.` : "")
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async autocomplete(interaction: AutocompleteInteraction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const staff = await StaffRepository.findAll("active");
        const filtered = staff
            .filter(s => s.username.toLowerCase().includes(focused))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(s => ({ name: `${s.username} — ${s.department}/${s.position}`, value: s.discordId }))
        );
    },
};
