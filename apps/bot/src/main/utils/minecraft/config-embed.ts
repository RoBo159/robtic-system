import { EmbedBuilder } from "discord.js";
import { COLORS } from "@constants";
import type { IMinecraftConfig } from "@database/models/MinecraftConfig";

/** Current per-guild integration settings shown by `/minecraft config view`. */
export function buildConfigEmbed(guildName: string, config: IMinecraftConfig): EmbedBuilder {
    const mappings = config.roleMappings.length
        ? config.roleMappings.map(mapping => `<@&${mapping.roleId}> → \`${mapping.group}\``).join("\n")
        : "No role mappings configured";

    return new EmbedBuilder()
        .setTitle("⚙️ Minecraft Integration Settings")
        .addFields(
            { name: "Status channel", value: config.statusChannelId ? `<#${config.statusChannelId}>` : "Not set", inline: true },
            { name: "Chat channel", value: config.chatChannelId ? `<#${config.chatChannelId}>` : "Not set", inline: true },
            { name: "​", value: "​", inline: true },
            { name: "Chat bridge", value: config.chatBridgeEnabled ? "Enabled" : "Disabled", inline: true },
            { name: "Role sync", value: config.roleSyncEnabled ? "Enabled" : "Disabled", inline: true },
            { name: "​", value: "​", inline: true },
            { name: "Discord role → LuckPerms group", value: mappings },
        )
        .setFooter({ text: guildName })
        .setColor(COLORS.info)
        .setTimestamp();
}
