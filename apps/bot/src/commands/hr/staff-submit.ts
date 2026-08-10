import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { StaffRepository, SubmitConfigRepository, SubmissionTypeRepository } from "@database/repositories";
import { updatePanel } from "../../utils/hr/update-panel";
import { buildConfigPanel } from "../../utils/hr/config-panel";

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("staff-submit")
        .setDescription("Manage staff submission types")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub
                .setName("open")
                .setDescription("Open a submission type for applications")
                .addStringOption(opt =>
                    opt
                        .setName("type")
                        .setDescription("Submission type to open")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("close")
                .setDescription("Close a submission type from accepting applications")
                .addStringOption(opt =>
                    opt
                        .setName("type")
                        .setDescription("Submission type to close")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("config")
                .setDescription("Create or edit a submission type (name, roles, questions)")
                .addStringOption(opt =>
                    opt
                        .setName("type")
                        .setDescription("Existing type to edit, or a new name to create one")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("status").setDescription("Show all submission types status and staff count")
        ),

    async autocomplete(interaction: AutocompleteInteraction, client: BotClient) {
        const focused = interaction.options.getFocused().toLowerCase();
        const types = await SubmissionTypeRepository.list(interaction.guildId!);
        const items = types
            .filter(t => t.name.toLowerCase().includes(focused))
            .slice(0, 25)
            .map(t => ({ name: t.name, value: t.key }));

        await interaction.respond(items);
    },

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId!;

        if (sub === "open") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const key = interaction.options.getString("type", true);
            const type = await SubmissionTypeRepository.get(guildId, key);
            if (!type) {
                await interaction.editReply({ content: "❌ Submission type not found." });
                return;
            }

            const config = await SubmitConfigRepository.get(guildId);
            if (!config?.reviewChannelId) {
                await interaction.editReply({
                    content: "❌ Set the review channel first with `/setup-submit channel`.",
                });
                return;
            }

            if (type.isOpen) {
                await interaction.editReply({
                    content: `⚠️ **${type.name}** is already open.`,
                });
                return;
            }

            await SubmissionTypeRepository.setOpen(guildId, key, true);
            await updatePanel(client, config);

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`📋 ${type.name} — Opened`)
                        .setDescription(`Applications for **${type.name}** are now open. The panel has been updated.`)
                        .setColor(COLORS.success),
                ],
            });
            return;
        }

        if (sub === "close") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const key = interaction.options.getString("type", true);
            const type = await SubmissionTypeRepository.get(guildId, key);
            if (!type) {
                await interaction.editReply({ content: "❌ Submission type not found." });
                return;
            }

            if (!type.isOpen) {
                await interaction.editReply({
                    content: `⚠️ **${type.name}** is already closed.`,
                });
                return;
            }

            await SubmissionTypeRepository.setOpen(guildId, key, false);

            const config = await SubmitConfigRepository.get(guildId);
            if (config) await updatePanel(client, config);

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`🔒 ${type.name} — Closed`)
                        .setDescription(`Applications for **${type.name}** are now closed and removed from the panel.`)
                        .setColor(COLORS.error),
                ],
            });
            return;
        }

        if (sub === "config") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const name = interaction.options.getString("type", true);
            const { type } = await SubmissionTypeRepository.getOrCreate(guildId, name);

            await interaction.editReply({ ...buildConfigPanel(type) });
            return;
        }

        if (sub === "status") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const config = await SubmitConfigRepository.get(guildId);
            const types = await SubmissionTypeRepository.list(guildId);

            const staffCounts = await Promise.all(
                types.map(async t => ({
                    key: t.key,
                    count: (await StaffRepository.findByDepartment(t.key)).length,
                }))
            );

            const countMap = Object.fromEntries(staffCounts.map(s => [s.key, s.count]));

            const fields = types.map(t => {
                const manager = t.managerRoleIds.length
                    ? t.managerRoleIds.map(id => `<@&${id}>`).join(", ")
                    : "—";
                const staffCount = countMap[t.key] ?? 0;

                return {
                    name: `📋 ${t.name}`,
                    value: [
                        `Status: ${t.isOpen ? "✅ Open" : "🔒 Closed"}`,
                        `Staff: \`${staffCount}\``,
                        `Manager: ${manager}`,
                    ].join("\n"),
                    inline: true,
                };
            });

            const reviewChannelMention = config?.reviewChannelId ? `<#${config.reviewChannelId}>` : "Not set";
            const panelChannelMention = config?.panelChannelId ? `<#${config.panelChannelId}>` : "Not set";

            const embed = new EmbedBuilder()
                .setTitle("📊 Submission System Status")
                .addFields(fields.length ? fields : [{ name: "No submission types yet", value: "Use `/staff-submit config <name>` to create one." }])
                .addFields(
                    { name: "Review Channel", value: reviewChannelMention, inline: true },
                    { name: "Panel Channel", value: panelChannelMention, inline: true },
                )
                .setColor(COLORS.info)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
