import type { FeatureSubcommandHandler } from "@typings/feature";
import { RejoinRolesConfigRepository } from "@database/repositories";
import { buildConfigEmbed } from "../utils/build-config-embed";

type Field = "excludedRoleIds" | "staffRoleIds";

/**
 * One handler for all four add/remove subcommands — the only thing that differs is which list is
 * being edited and in which direction, and every one of them answers with the whole config so the
 * caller can see both lists after the change.
 */
const editRoles = (field: Field, action: "add" | "remove"): FeatureSubcommandHandler =>
    async (interaction, _client) => {
        const role = interaction.options.getRole("role", true);
        const guildId = interaction.guildId!;

        const config = action === "add"
            ? await RejoinRolesConfigRepository.addRole(guildId, field, role.id)
            : await RejoinRolesConfigRepository.removeRole(guildId, field, role.id);

        await interaction.editReply({ embeds: [buildConfigEmbed(config)] });
    };

export const excludeAdd = editRoles("excludedRoleIds", "add");
export const excludeRemove = editRoles("excludedRoleIds", "remove");
export const staffAdd = editRoles("staffRoleIds", "add");
export const staffRemove = editRoles("staffRoleIds", "remove");
