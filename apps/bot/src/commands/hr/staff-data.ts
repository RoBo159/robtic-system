import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { StaffRepository } from "@database/repositories";
import { hasDepartmentAuthority, hasFullPower } from "@bot/utils/access";

export default {
    category: "Staff",
    data: new SlashCommandBuilder()
        .setName("staff-data")
        .setDescription("بيانات الموظفين")
        .addSubcommand(sub =>
            sub.setName("set")
                .setDescription("تعديل بيانات موظف يدويًا")
                .addUserOption(opt => opt.setName("target").setDescription("الموظف").setRequired(true))
                .addStringOption(opt => opt.setName("name").setDescription("الاسم الحقيقي").setRequired(false))
                .addIntegerOption(opt => opt.setName("age").setDescription("العمر").setRequired(false).setMinValue(1).setMaxValue(120))
                .addStringOption(opt => opt.setName("country").setDescription("الدولة").setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName("view")
                .setDescription("عرض بيانات موظف")
                .addUserOption(opt => opt.setName("target").setDescription("الموظف").setRequired(true))
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        if (!interaction.guildId) return;

        const target = interaction.options.getUser("target", true);
        const staffRecord = await StaffRepository.findByDiscordId(target.id);

        if (!staffRecord) {
            await interaction.reply({ content: "❌ | هذا العضو ليس موظفًا مسجلًا.", flags: MessageFlags.Ephemeral });
            return;
        }

        const member = interaction.member as GuildMember;
        if (!(await hasDepartmentAuthority(member, staffRecord.department)) && !hasFullPower(member)) {
            await interaction.reply({ content: "❌ | ليست لديك صلاحية الوصول لبيانات موظفي هذا القسم.", flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();

        if (sub === "set") {
            const name = interaction.options.getString("name") ?? undefined;
            const age = interaction.options.getInteger("age") ?? undefined;
            const country = interaction.options.getString("country") ?? undefined;

            if (name === undefined && age === undefined && country === undefined) {
                await interaction.editReply({ content: "❌ | يجب تحديد حقل واحد على الأقل لتعديله." });
                return;
            }

            const updated = await StaffRepository.updateBio(target.id, { realName: name, age, country });

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.success)
                    .setTitle("✅ تم تحديث البيانات")
                    .addFields(
                        { name: "الاسم", value: updated?.realName ?? "غير محدد", inline: true },
                        { name: "العمر", value: updated?.age ? `${updated.age}` : "غير محدد", inline: true },
                        { name: "الدولة", value: updated?.country ?? "غير محدد", inline: true },
                    )],
            });
            return;
        }

        // sub === "view"
        const embed = new EmbedBuilder()
            .setTitle(`بيانات ${target.username}`)
            .setColor(COLORS.info)
            .addFields(
                { name: "الاسم", value: staffRecord.realName ?? "غير محدد", inline: true },
                { name: "العمر", value: staffRecord.age ? `${staffRecord.age}` : "غير محدد", inline: true },
                { name: "الدولة", value: staffRecord.country ?? "غير محدد", inline: true },
                { name: "القسم", value: staffRecord.department, inline: true },
                { name: "المنصب", value: staffRecord.position, inline: true },
                { name: "تاريخ التعيين", value: `<t:${Math.floor(staffRecord.hiredAt.getTime() / 1000)}:D>`, inline: true },
                { name: "الحالة", value: staffRecord.status, inline: true },
                { name: "عدد التحذيرات", value: `${staffRecord.warnings.length}`, inline: true },
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
