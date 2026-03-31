import {
    ContainerBuilder,
    ButtonStyle,
    MessageFlags,
    type ChatInputCommandInteraction,
    type ButtonInteraction,
    type GuildMember,
    type TextChannel,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ActionRowBuilder,
} from "discord.js";
import { Colors } from "@core/config";
import { PANELS, getPanel, getPanelKeys, registerPanel } from "./panelsData";
import { ServerConfigRepository } from "@database/repositories/ServerConfigRepository";
import { getUserLang, type Lang } from "@shared/utils/lang";
import emoji from "@shared/emojis.json";

function englishRules(): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0x5865F2)

        .addTextDisplayComponents(td =>
            td.setContent(`## ${emoji.info} Server Rules`)
        )

        .addSeparatorComponents(sep => sep)

        .addTextDisplayComponents(td =>
            td.setContent(
                "⚠ **Important:** This server follows **[Discord Terms of Service](https://discord.com/terms)** before anything else.\n" +
                "Any violation of Discord ToS will result in immediate moderation action."
            )
        )

        .addSeparatorComponents(sep => sep)

        .addTextDisplayComponents(td =>
            td.setContent(
                "**No Hate Speech**\n" +
                emoji.dots + "Discrimination of any kind — racism, homophobia, sexism — results in an instant ban.\n\n" +

                "**No Spam**\n" +
                emoji.dots + "Avoid flooding chats with messages, emojis, pings, or commands.\n\n" +

                "**Respect Everyone**\n" +
                emoji.dots + "Treat all members kindly. No harassment or toxic behavior.\n\n" +

                "**No NSFW or Extreme Content**\n" +
                emoji.dots + "Any adult, gore, or disturbing content will get you banned immediately.\n\n" +

                "**Use Channels Correctly**\n" +
                emoji.dots + "Every channel has a purpose. Follow it to keep the server organized.\n\n" +

                "**No Server Promotion**\n" +
                emoji.dots + "Sharing other Discord servers publicly or in DMs without permission is not allowed.\n\n" +

                "**No DM Advertising**\n" +
                emoji.dots + "Sending ads or spam in DMs to members will result in a permanent ban.\n\n" +

                "**Don't Abuse Bots**\n" +
                emoji.dots + "Spamming or misusing bot commands is not allowed.\n\n" +

                "**Don’t Impersonate Staff**\n" +
                emoji.dots + "Pretending to be staff — even as a joke — is an automatic ban.\n\n" +

                "**English or Arabic Only**\n" +
                emoji.dots + "Only these languages are allowed to keep moderation clear.\n\n" +

                "**No Ticket Abuse**\n" +
                emoji.dots + "Open tickets only when you actually need help.\n\n" +

                "**Follow Staff Decisions**\n" +
                emoji.dots + "Respect moderator actions. Use tickets if you disagree.\n\n" +

                "**Don’t Trick or Troll**\n" +
                emoji.dots + "Faking issues or wasting time will result in a timeout.\n\n" +

                "**No Threats or Exploits**\n" +
                emoji.dots + "Hacking, crashing, or threatening members = instant ban.\n\n" +

                "**Don’t Beg for Roles**\n" +
                emoji.dots + "Roles are earned or assigned — asking repeatedly will get you muted.\n\n" +

                "**No Toxic Memes or Jokes**\n" +
                emoji.dots + "Memes targeting members or groups will be punished.\n\n" +

                "**Don’t Tag Staff Unnecessarily**\n" +
                emoji.dots + "Multiple pings after tagging staff may result in mute.\n\n" +

                "**Keep Discussions Civil**\n" +
                emoji.dots + "Debate is fine. Personal attacks are not."
            )
        )
        .addSectionComponents(sc => 
            sc.addTextDisplayComponents(td =>
                td.setContent(
                    "-# You can always review the official Discord rules from here"
                )
            )
            .setButtonAccessory(btn =>
                btn.setLabel("Discord Terms of Service")
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://discord.com/terms")
            )
        )
}

function arabicRules(): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0x5865F2)

        .addTextDisplayComponents(td =>
            td.setContent(`## ${emoji.info} قوانين السيرفر`)
        )

        .addSeparatorComponents(sep => sep)

        .addTextDisplayComponents(td =>
            td.setContent(
                "⚠ **مهم:** هذا السيرفر يلتزم أولاً بـ **شروط خدمة Discord (ToS)**.\n" +
                "أي مخالفة لشروط ديسكورد ستؤدي إلى إجراء إداري مباشر."
            )
        )

        .addSeparatorComponents(sep => sep)

        .addTextDisplayComponents(td =>
            td.setContent(
                "**ممنوع خطاب الكراهية**\n" +
                emoji.dots + "أي نوع من التمييز مثل العنصرية أو الكراهية أو الإهانة يؤدي إلى حظر فوري.\n\n" +

                "**ممنوع السبام**\n" +
                emoji.dots + "تجنب إرسال الرسائل المتكررة أو الإيموجي أو المنشنات بشكل مزعج.\n\n" +

                "**احترام الجميع**\n" +
                emoji.dots + "تعامل مع جميع الأعضاء باحترام. يمنع التنمر أو المضايقة.\n\n" +

                "**ممنوع المحتوى غير اللائق أو العنيف**\n" +
                emoji.dots + "أي محتوى إباحي أو دموي أو صادم يؤدي إلى حظر مباشر.\n\n" +

                "**استخدم القنوات بشكل صحيح**\n" +
                emoji.dots + "لكل قناة غرض محدد. التزم بموضوع القناة.\n\n" +

                "**ممنوع الترويج لسيرفرات أخرى**\n" +
                emoji.dots + "نشر روابط سيرفرات أخرى بدون إذن غير مسموح.\n\n" +

                "**ممنوع الإعلانات في الخاص**\n" +
                emoji.dots + "إرسال روابط أو إعلانات للأعضاء في الخاص يؤدي إلى حظر دائم.\n\n" +

                "**لا تسيء استخدام البوتات**\n" +
                emoji.dots + "الإفراط في استخدام أو إساءة استخدام الأوامر قد يؤدي إلى تقييدك.\n\n" +

                "**ممنوع انتحال شخصية الطاقم**\n" +
                emoji.dots + "التظاهر بأنك من الإدارة حتى لو على سبيل المزاح يؤدي إلى حظر.\n\n" +

                "**اللغة العربية أو الإنجليزية فقط**\n" +
                emoji.dots + "للحفاظ على سهولة الإدارة يجب استخدام هاتين اللغتين فقط.\n\n" +

                "**ممنوع إساءة استخدام التذاكر**\n" +
                emoji.dots + "استخدم نظام التذاكر فقط عندما تحتاج مساعدة حقيقية.\n\n" +

                "**اتبع قرارات الإدارة**\n" +
                emoji.dots + "احترم قرارات الطاقم. إذا كان لديك اعتراض استخدم التذكرة.\n\n" +

                "**ممنوع التضليل أو التلاعب**\n" +
                emoji.dots + "اختلاق مشاكل أو إضاعة وقت الطاقم سيؤدي إلى تقييدك.\n\n" +

                "**ممنوع التهديد أو الاستغلال**\n" +
                emoji.dots + "أي محاولة اختراق أو تهديد للأعضاء أو السيرفر تؤدي إلى حظر فوري.\n\n" +

                "**ممنوع طلب الرتب**\n" +
                emoji.dots + "الرتب يتم منحها حسب الاستحقاق. طلبها بشكل متكرر قد يؤدي إلى كتمك.\n\n" +

                "**ممنوع الميمز أو المزاح المسيء**\n" +
                emoji.dots + "الميمز التي تستهدف الآخرين أو تسبب الإساءة غير مسموحة.\n\n" +

                "**لا تقم بعمل منشن للإدارة بدون سبب**\n" +
                emoji.dots + "بعد المنشن انتظر الرد. التكرار سيؤدي إلى كتمك.\n\n" +

                "**حافظ على نقاش محترم**\n" +
                emoji.dots + "النقاش مسموح، لكن الإهانات أو الشجارات غير مقبولة."
            )
        )
        .addSectionComponents(sc => 
            sc.addTextDisplayComponents(td =>
                td.setContent(
                    "-# يمكنك دائما الاطلاع على قوانين الديسكورد الرسمية من هنا"
                )
            )
            .setButtonAccessory(btn =>
                btn.setLabel("شروط خدمة Discord")
                    .setStyle(ButtonStyle.Link)
                    .setURL("https://discord.com/terms")
            )
        );
}

registerPanel({
    key: "rules",
    name: "📜 Terms of Service & Server Rules",
    description: `
    **Hello and welcome to our community.**

${emoji.dots}By joining this server, you automatically acknowledge and agree to comply with all community rules, policies, and guidelines established by the server administration.

${emoji.dots}All members are responsible for reviewing and understanding the rules provided in this server. Failure to read the rules does not exempt any member from responsibility or consequences.

${emoji.dots}The administration team reserves the right to take appropriate action when necessary to maintain a safe, respectful, and organized community environment.

${emoji.dots}By remaining in this server, you confirm your acceptance of these terms.
    `,
    buttonLabel: "Review Server Rules",
    accentColor: 0x5865F2,
    roles: [
        { roleId: "1362501805941985492", label: "Members" },
    ],
    getContent(lang: Lang) {
        return lang === "ar" ? arabicRules() : englishRules();
    }
});

export async function panelList(interaction: ChatInputCommandInteraction) {
    if (!PANELS.length) {
        await interaction.reply({ content: "No panels defined.", flags: MessageFlags.Ephemeral });
        return;
    }

    const sentPanels = await ServerConfigRepository.getSentPanels(interaction.guildId!);
    const lines = PANELS.map(p => {
        const sent = sentPanels.filter(s => s.panelKey === p.key);
        const status = sent.length > 0
            ? `✅ Sent ${sent.length}x (${sent.map(s => `<#${s.channelId}>`).join(", ")})`
            : "❌ Not sent";
        return `**${p.name}** (\`${p.key}\`) — ${status}`;
    });

    const embed = new EmbedBuilder()
        .setTitle("📋 Available Panels")
        .setDescription(lines.join("\n"))
        .setColor(Colors.info)
        .setFooter({ text: `${PANELS.length} panel(s) available` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export async function panelSend(interaction: ChatInputCommandInteraction) {
    const panelKey = interaction.options.getString("panel", true);
    const panel = getPanel(panelKey);

    if (!panel) {
        await interaction.reply({ content: `Panel \`${panelKey}\` not found.`, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = interaction.channel as TextChannel;

    if (panel.key === "dev_projects") {
        const container = panel.getContent("en", panel.name);
        const msg = await channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });

        await ServerConfigRepository.addSentPanel(interaction.guildId!, {
            panelKey: panel.key,
            channelId: channel.id,
            messageId: msg.id,
            sentBy: interaction.user.id,
        });

        await interaction.editReply({
            content: `✅ Panel **${panel.name}** sent to <#${channel.id}>.`,
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(panel.accentColor)
        .setTitle(panel.name)
        .setDescription(panel.description)
        .setImage(`https://raw.githubusercontent.com/robo159/assets/main/utils/discord/rules.png`)
        .setFooter({
            text: "Click the button below to view more details"
        });

    const button = new ButtonBuilder()
        .setCustomId(`panel_view_${panel.key}`)
        .setLabel(panel.buttonLabel)
        .setEmoji("1480426683570983014")
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(button);

    const msg = await channel.send({
        embeds: [embed],
        components: [row],
    });

    await ServerConfigRepository.addSentPanel(interaction.guildId!, {
        panelKey: panel.key,
        channelId: channel.id,
        messageId: msg.id,
        sentBy: interaction.user.id,
    });

    await interaction.editReply({
        content: `✅ Panel **${panel.name}** sent to <#${channel.id}>.`,
    });
}

export async function panelDelete(interaction: ChatInputCommandInteraction) {
    const messageId = interaction.options.getString("panel_message", true);
    const guildId = interaction.guildId!;

    const sentPanel = await ServerConfigRepository.getSentPanel(guildId, messageId);
    if (!sentPanel) {
        await interaction.reply({ content: "That panel was not found in the database.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const channel = await interaction.guild!.channels.fetch(sentPanel.channelId) as TextChannel | null;
        if (channel) {
            const msg = await channel.messages.fetch(messageId).catch(() => null);
            if (msg) await msg.delete();
        }
    } catch {
    }

    await ServerConfigRepository.removeSentPanel(guildId, messageId);
    const panel = getPanel(sentPanel.panelKey);

    await interaction.editReply({
        content: `🗑️ Deleted panel **${panel?.name ?? sentPanel.panelKey}** from <#${sentPanel.channelId}>.`,
    });
}

export async function panelButtonHandler(interaction: ButtonInteraction) {
    const panelKey = interaction.customId.replace("panel_view_", "");

    const panel = getPanel(panelKey);
    if (!panel) {
        await interaction.reply({ content: "This panel no longer exists.", flags: MessageFlags.Ephemeral });
        return;
    }

    const member = interaction.member as GuildMember;
    const lang = getUserLang(member);

    const matched = panel.roles.find(r => member.roles.cache.has(r.roleId));
    const container = panel.getContent(lang, matched?.label ?? null);

    await interaction.reply({
        components: [container],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
}

export function panelAutocompleteChoices(query: string) {
    const all = getPanelKeys();
    if (!query) return all.slice(0, 25);
    const lower = query.toLowerCase();
    return all.filter(p => p.name.toLowerCase().includes(lower) || p.value.toLowerCase().includes(lower)).slice(0, 25);
}

export async function sentPanelAutocomplete(guildId: string, query: string) {
    const sent = await ServerConfigRepository.getSentPanels(guildId);
    const choices = sent.map(s => {
        const panel = getPanel(s.panelKey);
        const label = `${panel?.name ?? s.panelKey} — #${s.channelId.slice(-4)} (${s.messageId.slice(-6)})`;
        return { name: label.slice(0, 100), value: s.messageId };
    });
    if (!query) return choices.slice(0, 25);
    const lower = query.toLowerCase();
    return choices.filter(c => c.name.toLowerCase().includes(lower)).slice(0, 25);
}


function devProjectsContent(name : string): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(
            td => td.setContent(`**## ${name}**`),
            td => td.setContent("Explore all projects created within the Robtic ecosystem — from community contributions to official releases.")
        )
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(
            td => td.setContent(`**${emoji.user} Member Projects**`),
            td => td.setContent(`\n Projects submitted by community members. \n Use \`/project share\` to submit your project — it will be reviewed and approved by the Dev Staff before being published.`)
        )
        .addSeparatorComponents(sep => sep.setDivider(false))
        .addTextDisplayComponents(
            td => td.setContent(`**${emoji.gear} Staff Projects**`),
            td => td.setContent(`\n Projects created by our Dev Staff. \n These projects showcase official tools, bots, and resources developed to support the community and enhance the Robtic experience.`)
        )
        .addSeparatorComponents(sep => sep.setDivider(false))
        .addTextDisplayComponents(
            td => td.setContent(`**${emoji["robtic-reading"]} Robtic Projects**`),
            td => td.setContent(`\n Official system projects developed by the core team. \n Featured on the Robtic YouTube channel and represent our core systems and innovations.`)
        )
        .addMediaGalleryComponents(mg =>
            mg.addItems(
                item => item.setURL("https://raw.githubusercontent.com/RoBo159/assets/refs/heads/main/utils/discord/Projects.png")
            )
        )
        .addActionRowComponents(row => row.setComponents(
            new StringSelectMenuBuilder()
                .setCustomId("dev_projects_menu")
                .setPlaceholder("Select a Project Category")
                .addOptions([
                    { label: "Member Projects", value: "member", description: "Projects submitted by regular server members", emoji: emoji.user },
                    { label: "Staff Projects", value: "developer", description: "Projects submitted by the Dev Staff", emoji: emoji.gear },
                    { label: "Robtic Projects", value: "system", description: "Official system projects", emoji: emoji["robtic-reading"] },
                ])
        ));
}

registerPanel({
    key: "dev_projects",
    name: "📂 Development Projects Hub",
    description: "Browse Member, Staff, and Robtic projects.",
    buttonLabel: "View Projects",
    accentColor: 0x2b2d31,
    roles: [],
    getContent(lang: Lang, name) {
        return devProjectsContent(name || "");
    }
});
