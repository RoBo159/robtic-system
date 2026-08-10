import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdsConfigRepository } from "@database/repositories";
import { buildAdsPanel } from "../utils/ads-panels";
import { buildConfigRoot } from "../utils/ads-config-views";
import { Logger } from "@logger";

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("setup-ads")
        .setDescription("Configure the advertisement system")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub
                .setName("channel")
                .setDescription("Set the channel where new ad orders are sent for approval")
                .addChannelOption(opt =>
                    opt.setName("channel").setDescription("The approval channel").setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("panel").setDescription("Post the advertisement ordering panel in this channel")
        )
        .addSubcommand(sub =>
            sub.setName("config").setDescription("Open the ads configuration panel (prices, details, exchange rate)")
        )
        .addSubcommand(sub =>
            sub
                .setName("manager")
                .setDescription("Set the role allowed to accept/reject ad orders and claim ad tickets")
                .addRoleOption(opt =>
                    opt.setName("role").setDescription("The ads manager role").setRequired(true)
                )
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId!;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (sub === "channel") {
            const channel = interaction.options.getChannel("channel", true) as TextChannel;
            await AdsConfigRepository.setApprovalChannel(guildId, channel.id);

            await interaction.editReply({
                content: `✅ Ad orders will now be sent to ${channel} for approval.`,
            });
            return;
        }

        if (sub === "panel") {
            const config = await AdsConfigRepository.get(guildId);
            const channel = interaction.channel as TextChannel;

            const { components, files } = buildAdsPanel(config);
            const msg = await channel.send({ components, files, flags: MessageFlags.IsComponentsV2 });

            await AdsConfigRepository.setPanel(guildId, channel.id, msg.id);

            await interaction.editReply({
                content: `✅ Ads panel posted in ${channel}.`,
            });
            return;
        }

        if (sub === "manager") {
            const role = interaction.options.getRole("role", true);
            await AdsConfigRepository.setManagerRole(guildId, role.id);

            await interaction.editReply({
                content: `✅ ${role} يمكنهم الآن قبول/رفض طلبات الإعلانات واستلام تذاكرها.`,
            });
            return;
        }

        if (sub === "config") {
            try {
                const config = await AdsConfigRepository.get(guildId);
                await interaction.editReply({
                    ...buildConfigRoot(config),
                    flags: MessageFlags.IsComponentsV2,
                });
            } catch ( err ) {
                Logger.error(`error ${err}`)
                await interaction.editReply({ content: "❌ Something went wrong." }).catch(() => {});
            }
        }
    },
};
