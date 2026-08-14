import { EmbedBuilder } from "discord.js";
import type { IRejoinRolesConfig } from "@database/models";
import { COLORS } from "@constants";

const roleList = (ids: string[], empty: string) => (ids.length ? ids.map(id => `<@&${id}>`).join(", ") : empty);

const hours = (value: number) => (value % 24 === 0 ? `${value / 24} day(s)` : `${value} hour(s)`);

export function buildConfigEmbed(config: IRejoinRolesConfig): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("Rejoin roles")
        .setColor(COLORS.info)
        .setDescription("Roles a member gets back when they return, and how long each kind survives.")
        .addFields(
            { name: "Member roles kept for", value: hours(config.retentionHours), inline: true },
            { name: "Staff roles kept for", value: hours(config.staffRetentionHours), inline: true },
            { name: "​", value: "​", inline: true },
            { name: "Never restored", value: roleList(config.excludedRoleIds, "None"), inline: false },
            {
                name: "Treated as staff",
                value: roleList(config.staffRoleIds, "None set — falls back to this server's staff tier roles"),
                inline: false,
            },
        )
        .setFooter({ text: "Snapshots are deleted once the member window passes. Banned members are never saved." });
}
