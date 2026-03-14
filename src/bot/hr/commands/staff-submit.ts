import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  TextChannel,
  MessageFlags
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { StaffRepository } from "@database/repositories";

import { departments } from "../config/departments";
import { getDepartmentEmbedConfig } from "../config/embeds";

export default {
  data: new SlashCommandBuilder()
    .setName("staff-submit")
    .setDescription("staff-submit command")
    .addSubcommand((sub) =>
      sub
        .setName("open")
        .setDescription("Open staff submission")
        .addStringOption((opt) =>
          opt
            .setName("department")
            .setDescription("The department")
            .setRequired(true)
            .addChoices(
              ...departments.map((d) => ({ name: d.name, value: d.name })),
            ),
        ),
    ),

  async run(interaction: ChatInputCommandInteraction, client: BotClient) {
    const department = interaction.options.getString("department", true);
    const selected = departments.find((d) => d.name === department)!;
    const embedConfig = getDepartmentEmbedConfig(selected.name);

    const channel = interaction.guild?.channels.cache.get(selected.channelId) as TextChannel | undefined;

    if (!channel) {
      return await interaction.reply({
        content: "Channel not found",
        flags: MessageFlags.Ephemeral,
      });
    }

    await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
      SendMessages: false,
      ViewChannel: true,
    });

    const submitButton = new ButtonBuilder()
      .setCustomId(`staff-start_${selected.name}`)
      .setLabel("Submit")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      submitButton,
    );

    const openEmbed = new EmbedBuilder()
      .setTitle(embedConfig.openTitle)
      .setDescription(embedConfig.openDescription)
      .setColor(embedConfig.openColor)
      .setFooter({ text: "Click Submit to start your application" });

    const msg = await channel.send({
      content: `<@&1362501792490983716>, You can submit now`,
      embeds: [openEmbed],
      components: [row],
    });

    await StaffRepository.openSubmission({
      messageId: msg.id,
      channelId: msg.channelId,
      department: selected.name,
    });

    await interaction.reply({
      content: `:white_check_mark: | Submission for ${selected.name} department staff is now open `,
      flags: MessageFlags.Ephemeral,
    });
  },
};
