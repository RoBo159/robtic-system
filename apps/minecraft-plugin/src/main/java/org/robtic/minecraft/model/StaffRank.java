package org.robtic.minecraft.model;

/**
 * One configured staff rank.
 *
 * @param id             key from roles.yml, used in permission nodes and log lines
 * @param discordRoleId  the Discord role that grants it — never hardcoded, always configured
 * @param displayName    shown in staff chat and Discord embeds
 * @param group          LuckPerms group applied for the duration of a staff-mode session
 * @param priority       ordering, lowest first; decides which rank wins when several are held
 */
public record StaffRank(String id, String discordRoleId, String displayName, String group, int priority) {
}
