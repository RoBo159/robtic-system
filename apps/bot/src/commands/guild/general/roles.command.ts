import {
    SlashCommandBuilder,
    EmbedBuilder,
    type ChatInputCommandInteraction,
    type Role,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS, EMBED_DESCRIPTION_LIMIT, MODERATION_ACTION_MESSAGES as MSG } from "@constants";

/** `<@&id> — 12 members · id` — the id is spelled out because that is what /role and /set-role take. */
function roleLine(role: Role): string {
    return `<@&${role.id}> — ${role.members.size} member(s) · \`${role.id}\``;
}

export default {
    scope: "guild",
    access: "general",
    category: "Moderation",
    data: new SlashCommandBuilder()
        .setName("roles")
        .setDescription("List every role on this server, highest first"),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: MSG.guildOnly });
            return;
        }

        await interaction.deferReply();

        const roles = [...(await guild.roles.fetch()).values()]
            .filter(role => role.id !== guild.id)
            .sort((a, b) => b.position - a.position);

        if (roles.length === 0) {
            await interaction.editReply({ content: MSG.rolesListEmpty });
            return;
        }

        const lines: string[] = [];
        let length = 0;
        for (const role of roles) {
            const line = roleLine(role);
            if (length + line.length + 1 > EMBED_DESCRIPTION_LIMIT) break;
            lines.push(line);
            length += line.length + 1;
        }

        const embed = new EmbedBuilder()
            .setTitle(MSG.rolesListTitle(guild.name))
            .setDescription(lines.join("\n"))
            .setColor(COLORS.info)
            .setFooter({ text: MSG.rolesListFooter(lines.length, roles.length) })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
