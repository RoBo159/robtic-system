package org.robtic.minecraft.config;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.robtic.minecraft.model.StaffRank;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * `roles.yml` — the staff ladder, keyed by LuckPerms group.
 *
 * <h2>LuckPerms decides who is staff</h2>
 *
 * A rank is a LuckPerms group. Whoever holds the group holds the rank, and that is resolved on this
 * server with no network call — which is both the whole point of the change and where most of the
 * old per-player request volume went.
 *
 * This file maps that group onto the two things LuckPerms cannot know: what the rank is called, and
 * which Discord role should mirror it.
 *
 * <pre>
 *   LuckPerms  →  who HOLDS the rank        (authority)
 *   this file  →  what the rank MEANS       (name, order, Discord role to mirror onto)
 *   Discord    →  a reflection of the above (written by the API, never read back)
 * </pre>
 *
 * The direction is one-way on purpose. Granting someone a Discord role does not make them staff;
 * granting them the LuckPerms group does, and the Discord role follows.
 *
 * <h2>Precedence</h2>
 *
 * The order is `priority`, ascending. A player holding several rank groups resolves to the lowest
 * number, so an Admin who also inherits `helper` is still an Admin.
 */
public final class RoleSettings {

    private final List<StaffRank> ranks;
    private final String baseGroup;
    private final String jailRoleId;
    private final Map<String, String> groupRoles;

    RoleSettings(FileConfiguration config) {
        this.baseGroup = config.getString("base-group", "staff").toLowerCase(Locale.ROOT);
        this.jailRoleId = config.getString("jail-role-id", "").trim();

        List<StaffRank> parsed = new ArrayList<>();
        ConfigurationSection section = config.getConfigurationSection("ranks");

        if (section != null) {
            int priority = 0;
            for (String key : section.getKeys(false)) {
                ConfigurationSection rank = section.getConfigurationSection(key);
                if (rank == null) {
                    continue;
                }

                String group = rank.getString("group", key).trim().toLowerCase(Locale.ROOT);
                String roleId = rank.getString("discord-role-id", "").trim();
                String name = rank.getString("name", key);

                // Only the group is required now. A rank with no Discord role id is still a real
                // rank in game — it simply has nothing to mirror onto, which is a perfectly ordinary
                // configuration for a server that does not want every rung visible on Discord.
                if (group.isBlank()) {
                    continue;
                }

                parsed.add(new StaffRank(key.toLowerCase(Locale.ROOT), roleId, name, group, rank.getInt("priority", priority)));
                priority++;
            }
        }

        parsed.sort(Comparator.comparingInt(StaffRank::priority));
        this.ranks = List.copyOf(parsed);

        Map<String, String> extra = new LinkedHashMap<>();
        ConfigurationSection mappings = config.getConfigurationSection("group-roles");
        if (mappings != null) {
            for (String group : mappings.getKeys(false)) {
                String roleId = mappings.getString(group, "").trim();
                if (!roleId.isBlank()) {
                    extra.put(group.toLowerCase(Locale.ROOT), roleId);
                }
            }
        }
        this.groupRoles = Map.copyOf(extra);
    }

    public List<StaffRank> ranks() {
        return ranks;
    }

    /**
     * A group staff are expected to hold alongside their rank, for permissions common to all staff.
     *
     * The plugin never adds or removes it: staff mode no longer changes groups, and `/staff promote`
     * only moves rank groups. It is reported to the API for the session record and is otherwise the
     * operator's to grant in LuckPerms.
     */
    public String baseGroup() {
        return baseGroup;
    }

    /** Discord role applied for the duration of a jail, or blank when the feature is unused. */
    public String jailRoleId() {
        return jailRoleId;
    }

    public boolean hasRanks() {
        return !ranks.isEmpty();
    }

    /**
     * The highest-priority rank among the LuckPerms groups a player currently holds.
     *
     * This replaced a lookup against the player's Discord roles, which needed the roles to have been
     * fetched from the API first. Groups are already in memory, so this is now free.
     */
    public Optional<StaffRank> highestFor(List<String> heldGroups) {
        List<String> normalised = heldGroups.stream().map(group -> group.toLowerCase(Locale.ROOT)).toList();
        return ranks.stream().filter(rank -> normalised.contains(rank.group())).findFirst();
    }

    /**
     * Every Discord role id this configuration manages — the rank roles plus the extra group
     * mappings.
     *
     * The sync only ever revokes a role that appears here, so a role granted on Discord by hand for
     * some unrelated reason is never taken away by the game server.
     */
    public List<String> managedRoleIds() {
        List<String> ids = new ArrayList<>();
        for (StaffRank rank : ranks) {
            if (!rank.discordRoleId().isBlank() && !ids.contains(rank.discordRoleId())) {
                ids.add(rank.discordRoleId());
            }
        }
        for (String roleId : groupRoles.values()) {
            if (!ids.contains(roleId)) {
                ids.add(roleId);
            }
        }
        return List.copyOf(ids);
    }

    /**
     * The Discord role ids implied by the groups a player holds.
     *
     * Covers both sources: a rank group contributes its rank's role, and anything in `group-roles`
     * contributes directly. A group with no role configured contributes nothing rather than failing.
     */
    public List<String> roleIdsFor(List<String> heldGroups) {
        List<String> ids = new ArrayList<>();

        for (String raw : heldGroups) {
            String group = raw.toLowerCase(Locale.ROOT);

            for (StaffRank rank : ranks) {
                if (rank.group().equals(group) && !rank.discordRoleId().isBlank() && !ids.contains(rank.discordRoleId())) {
                    ids.add(rank.discordRoleId());
                }
            }

            String mapped = groupRoles.get(group);
            if (mapped != null && !ids.contains(mapped)) {
                ids.add(mapped);
            }
        }

        return List.copyOf(ids);
    }

    /** The rung above the given one, or empty when it is already the top. */
    public Optional<StaffRank> above(StaffRank rank) {
        int index = ranks.indexOf(rank);
        return index > 0 ? Optional.of(ranks.get(index - 1)) : Optional.empty();
    }

    /** The rung below the given one, or empty when it is already the bottom. */
    public Optional<StaffRank> below(StaffRank rank) {
        int index = ranks.indexOf(rank);
        return index >= 0 && index < ranks.size() - 1 ? Optional.of(ranks.get(index + 1)) : Optional.empty();
    }

    /** The lowest rung, which is where an unranked player is promoted to. */
    public Optional<StaffRank> lowest() {
        return ranks.isEmpty() ? Optional.empty() : Optional.of(ranks.get(ranks.size() - 1));
    }

    /** A rank by its key or display name, for `/staff promote <player> <rank>`. */
    public Optional<StaffRank> byName(String name) {
        String wanted = name.toLowerCase(Locale.ROOT);
        return ranks.stream()
                .filter(rank -> rank.id().equals(wanted) || rank.displayName().toLowerCase(Locale.ROOT).equals(wanted))
                .findFirst();
    }

    /**
     * The rank groups, and only those — used by `/staff promote|demote` to move somebody between
     * rungs without disturbing anything else.
     *
     * The base group is deliberately excluded. It is not a rank, so promoting a Helper to Admin
     * must not strip it; including it here meant every promotion silently removed whatever common
     * staff permissions the base group carries.
     */
    public List<String> rankGroups() {
        return ranks.stream().map(StaffRank::group).distinct().toList();
    }
}
