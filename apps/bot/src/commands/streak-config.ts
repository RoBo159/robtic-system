import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ChannelType,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { StreakSettingsRepository, StreakRepository, StreakRecoveryRepository } from "@database/repositories";
import { COLORS, STREAK_CONFIG } from "@constants";
import { formatDuration } from "@utils";
import { applyStreakRole } from "../utils/streak-role";

export default {
    category: "Streak",
    data: new SlashCommandBuilder()
        .setName("streak-config")
        .setDescription("Configure the streak system for this server")

        .addSubcommandGroup(group =>
            group
                .setName("channel")
                .setDescription("Manage streak channels")
                .addSubcommand(sub =>
                    sub
                        .setName("add")
                        .setDescription("Add a streak channel")
                        .addChannelOption(opt =>
                            opt.setName("channel").setDescription("Channel to add").addChannelTypes(ChannelType.GuildText).setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("remove")
                        .setDescription("Remove a streak channel")
                        .addChannelOption(opt =>
                            opt.setName("channel").setDescription("Channel to remove").addChannelTypes(ChannelType.GuildText).setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("list").setDescription("List configured streak channels")
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName("reminder")
                .setDescription("Manage streak expiry reminders")
                .addSubcommand(sub =>
                    sub
                        .setName("default")
                        .setDescription("Enable or disable expiry reminders for this server")
                        .addBooleanOption(opt =>
                            opt.setName("enabled").setDescription("Whether reminders should be sent").setRequired(true)
                        )
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("settings")
                .setDescription("View or update streak settings")
                .addIntegerOption(opt =>
                    opt.setName("min-length").setDescription("Minimum message length to count towards a streak").setMinValue(1).setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("return")
                .setDescription("Restore an expired streak (must be within the recovery window)")
                .addUserOption(opt =>
                    opt.setName("user").setDescription("The user to restore").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("sync")
                .setDescription("Sync all streaks from another server the bot is in into this server")
                .addStringOption(opt =>
                    opt.setName("source-guild-id").setDescription("ID of the server to copy streaks from").setRequired(true)
                )
        ),

    requiredPermission: 80,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildId = interaction.guildId!;
        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();

        if (group === "channel") {
            if (sub === "add") {
                const channel = interaction.options.getChannel("channel", true);
                await StreakSettingsRepository.addChannel(guildId, channel.id);
                await interaction.editReply({ content: `تمت إضافة <#${channel.id}> كقناة للتتابع.` });
                return;
            }

            if (sub === "remove") {
                const channel = interaction.options.getChannel("channel", true);
                await StreakSettingsRepository.removeChannel(guildId, channel.id);
                await interaction.editReply({ content: `تمت إزالة <#${channel.id}> من قنوات التتابع.` });
                return;
            }

            const settings = await StreakSettingsRepository.getOrCreate(guildId);
            const list = settings.channels.length ? settings.channels.map(id => `<#${id}>`).join(", ") : "لا يوجد";
            await interaction.editReply({
                embeds: [new EmbedBuilder().setTitle("قنوات التتابع").setDescription(list).setColor(COLORS.info)],
            });
            return;
        }

        if (group === "reminder") {
            const enabled = interaction.options.getBoolean("enabled", true);
            await StreakSettingsRepository.setRemindersEnabled(guildId, enabled);
            await interaction.editReply({ content: `أصبحت تذكيرات انتهاء التتابع الآن **${enabled ? "مفعّلة" : "معطّلة"}**.` });
            return;
        }

        if (sub === "settings") {
            const minLength = interaction.options.getInteger("min-length");
            let settings = await StreakSettingsRepository.getOrCreate(guildId);
            if (minLength !== null) {
                settings = await StreakSettingsRepository.setMinMessageLength(guildId, minLength);
            }

            const embed = new EmbedBuilder()
                .setTitle("إعدادات التتابع")
                .addFields(
                    { name: "القنوات", value: settings.channels.length ? settings.channels.map(id => `<#${id}>`).join(", ") : "لا يوجد" },
                    { name: "التذكيرات", value: settings.remindersEnabled ? "مفعّل" : "معطّل", inline: true },
                    { name: "الحد الأدنى لطول الرسالة", value: `${settings.minMessageLength}`, inline: true },
                    { name: "مدة الحصول على التتابع", value: formatDuration(STREAK_CONFIG.claimWindowMs), inline: true },
                    { name: "مدة انتهاء الصلاحية", value: formatDuration(STREAK_CONFIG.expireWindowMs), inline: true },
                    { name: "حد التذكير", value: formatDuration(STREAK_CONFIG.reminderThresholdMs), inline: true },
                    { name: "مدة الاسترجاع", value: formatDuration(STREAK_CONFIG.recoveryWindowMs), inline: true },
                )
                .setColor(COLORS.info)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (sub === "sync") {
            const sourceGuildId = interaction.options.getString("source-guild-id", true).trim();

            if (sourceGuildId === guildId) {
                await interaction.editReply({ content: "لا يمكن مزامنة السيرفر مع نفسه." });
                return;
            }

            const sourceGuild = client.guilds.cache.get(sourceGuildId);
            if (!sourceGuild) {
                await interaction.editReply({ content: "البوت غير موجود في السيرفر المصدر." });
                return;
            }

            const count = await StreakRepository.countGuild(sourceGuildId);
            if (count === 0) {
                await interaction.editReply({ content: `لا يوجد أي تتابعات في **${sourceGuild.name}**.` });
                return;
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`streak-sync-confirm_${interaction.user.id}_${sourceGuildId}`)
                    .setLabel("تأكيد المزامنة")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`streak-sync-cancel_${interaction.user.id}`)
                    .setLabel("إلغاء")
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle("⚠️ تأكيد مزامنة التتابع")
                    .setColor(COLORS.warning)
                    .setDescription(
                        `سيتم نسخ **${count}** تتابع من **${sourceGuild.name}** إلى هذا السيرفر.\n` +
                        `عند تعارض البيانات سيتم الاحتفاظ بالقيمة الأعلى، وسيتم تحديث أدوار التتابع تلقائيًا.`
                    )],
                components: [row],
            });
            return;
        }

        // sub === "return"
        const user = interaction.options.getUser("user", true);
        const recovery = await StreakRecoveryRepository.find(user.id, guildId);

        if (!recovery) {
            await interaction.editReply({ content: `لا يوجد تتابع قابل للاسترجاع لـ ${user}.` });
            return;
        }

        const withinWindow = Date.now() - recovery.expiredAt.getTime() <= STREAK_CONFIG.recoveryWindowMs;
        if (!withinWindow) {
            await interaction.editReply({ content: `انتهت مدة استرجاع تتابع ${user}.` });
            return;
        }

        await StreakRepository.restore(user.id, guildId, recovery.currentStreak, recovery.bestStreak);
        await StreakRecoveryRepository.delete(user.id, guildId);

        const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
        if (member) {
            await applyStreakRole(member, recovery.currentStreak).catch(() => null);
        }

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("✅ تم استرجاع التتابع")
                .setColor(COLORS.success)
                .setDescription(`تم استرجاع تتابع ${user} إلى **${recovery.currentStreak}** (الأفضل **${recovery.bestStreak}**).`)],
        });
    },
};
