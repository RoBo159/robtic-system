import { MinecraftConfigRepository } from "@database/repositories";

export interface LuckPermsGroupSync {
    /** Groups the member should hold, from their current Discord roles. */
    grant: string[];
    /** Mapped groups the member must not hold. Groups outside this set are never touched. */
    revoke: string[];
    /** Every group under Discord's control, so the plugin knows the boundary of the sync. */
    managed: string[];
}

/**
 * Translates a member's Discord roles into a LuckPerms group delta. Only groups that appear in the
 * guild's mappings are ever listed, which is what keeps manually assigned groups safe.
 */
export async function resolveLuckPermsGroups(guildId: string, roleIds: string[]): Promise<LuckPermsGroupSync> {
    const mappings = await MinecraftConfigRepository.getRoleMappings(guildId);
    const held = new Set(roleIds);

    const grant = new Set<string>();
    const managed = new Set<string>();

    for (const mapping of mappings) {
        managed.add(mapping.group);
        if (held.has(mapping.roleId)) grant.add(mapping.group);
    }

    return {
        grant: [...grant],
        revoke: [...managed].filter(group => !grant.has(group)),
        managed: [...managed],
    };
}
