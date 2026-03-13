import {
    ContainerBuilder,
    SectionBuilder,
    ButtonStyle,
    MessageFlags,
    type ChatInputCommandInteraction,
    type ButtonInteraction,
    type GuildMember,
    type TextChannel,
    EmbedBuilder,
} from "discord.js";
import { Colors } from "@core/config";
import { PANELS, getPanel, getPanelKeys, registerPanel } from "./panelsData";
import { ServerConfigRepository } from "@database/repositories/ServerConfigRepository";
import { getUserLang, type Lang } from "@shared/utils/lang";

// ─── Panel Content Builders ───────────────────────────────────────────────────
// Each panel's language + role content is defined here.
// Add new panels by creating content functions and calling registerPanel().

function englishRules(): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(td =>
            td.setContent("## 📋 Member Rules")
        )
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent(
                "**1.** Be respectful to all members.\n" +
                "**2.** No spam, flooding, or self-promotion.\n" +
                "**3.** No NSFW or inappropriate content.\n" +
                "**4.** No harassment, bullying, or threats.\n" +
                "**5.** Use channels for their intended purpose.\n" +
                "**6.** Follow Discord's Terms of Service.\n" +
                "**7.** Do not share personal information.\n" +
                "**8.** Listen to staff directives.\n" +
                "**9.** No impersonation of staff or members.\n" +
                "**10.** Have fun and contribute positively!"
            )
        );
}

function arabicRules(): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(td =>
            td.setContent("## 📋 قوانين الأعضاء")
        )
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent(
                "**1.** احترم جميع الأعضاء.\n" +
                "**2.** ممنوع السبام أو الترويج الذاتي.\n" +
                "**3.** ممنوع المحتوى غير اللائق.\n" +
                "**4.** ممنوع التحرش أو التنمر أو التهديد.\n" +
                "**5.** استخدم القنوات لغرضها المحدد.\n" +
                "**6.** اتبع شروط خدمة ديسكورد.\n" +
                "**7.** لا تشارك المعلومات الشخصية.\n" +
                "**8.** استمع لتوجيهات الطاقم.\n" +
                "**9.** ممنوع انتحال شخصية الطاقم أو الأعضاء.\n" +
                "**10.** استمتع وساهم بإيجابية!"
            )
        );
}

function englishRulesFallback(): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(td =>
            td.setContent("## 📋 General Rules")
        )
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent("Please respect all community guidelines and follow Discord's Terms of Service.")
        );
}

function arabicRulesFallback(): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(td =>
            td.setContent("## 📋 القوانين العامة")
        )
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent("يرجى احترام جميع إرشادات المجتمع واتباع شروط خدمة ديسكورد.")
        );
}

// ─── Panel Registration ───────────────────────────────────────────────────────

registerPanel({
    key: "rules",
    name: "Server Rules",
    description: "This is all server rules",
    buttonLabel: "Check Rules",
    accentColor: 0x5865F2,
    roles: [
        { roleId: "1362501805941985492", label: "Members" },
    ],
    getContent(lang: Lang, roleLabel: string | null) {
        if (roleLabel === "Members") {
            return lang === "ar" ? arabicRules() : englishRules();
        }
        return lang === "ar" ? arabicRulesFallback() : englishRulesFallback();
    },
});

// ─── Command Handlers ─────────────────────────────────────────────────────────

/**
 * /panels list — shows all available panels
 */
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

/**
 * /panels send <panel> — sends a single main panel with a button
 */
export async function panelSend(interaction: ChatInputCommandInteraction) {
    const panelKey = interaction.options.getString("panel", true);
    const panel = getPanel(panelKey);

    if (!panel) {
        await interaction.reply({ content: `Panel \`${panelKey}\` not found.`, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = interaction.channel as TextChannel;

    const container = new ContainerBuilder()
        .setAccentColor(panel.accentColor)
        .addTextDisplayComponents(td =>
            td.setContent(`## ${panel.name}`)
        )
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent(panel.description)
        )
        .addSectionComponents(section =>
            section
                .addTextDisplayComponents(td =>
                    td.setContent("-# Click the button to view details")
                )
                .setButtonAccessory(button =>
                    button
                        .setCustomId(`panel_view_${panel.key}`)
                        .setLabel(panel.buttonLabel)
                        .setStyle(ButtonStyle.Primary)
                )
        );

    const section = new SectionBuilder()
    .addTextDisplayComponents(td => 
        td.setContent("")
    )
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
