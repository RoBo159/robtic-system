package org.robtic.premium.config;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * `premium.yml` — the Discord role → LuckPerms group mapping and the limits each tier carries.
 *
 * <h2>The one Discord → Minecraft flow</h2>
 *
 * Premium is bought on Discord, so here the role really is the source and the group follows it.
 * That is the reverse of a staff rank, where the group is the authority and Discord mirrors it.
 *
 * The two can only coexist because they touch disjoint sets: the staff mirror moves role ids named
 * in roles.yml, and premium sync moves the groups named here. {@link #managedGroups()} is what the
 * sync uses to know which groups it owns — and therefore which it may safely remove.
 */
public final class PremiumSettings {

    /** One tier, exactly as the API stores it. */
    public record Tier(
            String id,
            String name,
            int level,
            String discordRoleId,
            String group,
            int homeLimit,
            int backUses,
            int lockedChestLimit,
            boolean portableChest,
            boolean cosmetics
    ) {
    }

    private final List<Tier> tiers;
    private final int freeHomeLimit;
    private final long backWindowMillis;

    public PremiumSettings(FileConfiguration config) {
        this.freeHomeLimit = config.getInt("free-home-limit", 2);
        this.backWindowMillis = config.getLong("back-window-minutes", 240L) * 60_000L;

        List<Tier> parsed = new ArrayList<>();
        ConfigurationSection section = config.getConfigurationSection("tiers");

        if (section != null) {
            for (String key : section.getKeys(false)) {
                ConfigurationSection tier = section.getConfigurationSection(key);
                if (tier == null) {
                    continue;
                }

                String roleId = tier.getString("discord-role-id", "").trim();
                String group = tier.getString("luckperms-group", "").trim().toLowerCase(Locale.ROOT);

                // Both halves are required: a tier with no role can never be held, and one with no
                // group has nothing to grant. Either way it is inert, so it is skipped rather than
                // kept as a rung that silently does nothing — which is also what lets the packaged
                // example ship with blank ids.
                if (roleId.isBlank() || group.isBlank()) {
                    continue;
                }

                parsed.add(new Tier(
                        key.toLowerCase(Locale.ROOT),
                        tier.getString("name", key),
                        tier.getInt("level", 1),
                        roleId,
                        group,
                        tier.getInt("home-limit", 5),
                        tier.getInt("back-uses", 0),
                        tier.getInt("locked-chest-limit", 0),
                        tier.getBoolean("portable-chest", false),
                        tier.getBoolean("cosmetics", true)));
            }
        }

        parsed.sort(Comparator.comparingInt(Tier::level).reversed());
        this.tiers = List.copyOf(parsed);
    }

    public List<Tier> tiers() {
        return tiers;
    }

    public int freeHomeLimit() {
        return freeHomeLimit;
    }

    public long backWindowMillis() {
        return backWindowMillis;
    }

    /**
     * Every LuckPerms group premium owns.
     *
     * The sync only ever removes a group in this list, so a group an operator granted by hand — or
     * one belonging to a staff rank — is never taken away by premium.
     */
    public List<String> managedGroups() {
        return tiers.stream().map(Tier::group).distinct().toList();
    }

    public boolean isEmpty() {
        return tiers.isEmpty();
    }
}
