package org.robtic.minecraft.progression.workspace;

import org.bukkit.configuration.ConfigurationSection;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Logger;

/**
 * What one upgrade level gives.
 *
 * <h2>Capabilities, not a list of features</h2>
 *
 * A tier could have been {@code storageCapacity}, {@code hasSellNpc}, {@code hasUpgradeNpc} — three
 * fields that would have to become four when contracts arrive, five for events, six for decorations.
 * Every one of those is a code change and a release for something the brief explicitly says must be
 * extensible.
 *
 * Instead a tier carries a set of {@link #capabilities} — arbitrary strings — and a system asks
 * whether the workspace has the one it cares about. A future contracts module ships with
 * {@code contracts} in tier 3's list and needs nothing here. The two numeric values that are
 * genuinely universal, storage and NPC count, stay as fields because everything reads them.
 *
 * <h2>Cost is per tier, not cumulative</h2>
 *
 * {@link #cost} is what it takes to reach this tier from the one below. A server rebalancing tier 4
 * therefore does not silently change what tiers 2 and 3 cost.
 *
 * @param level        1-based
 * @param display      shown in the upgrade menu
 * @param cost         Robs to reach this tier from the previous one
 * @param storageSlots how many items the virtual storage holds at this tier
 * @param npcRoles     which NPC roles are staffed here; see {@link WorkspaceNpcRole}
 * @param capabilities open-ended feature flags a future system can gate on
 * @param taxMultiplier scales the base tax, so a larger workspace costs more to keep
 */
public record WorkspaceTier(
        int level,
        String display,
        double cost,
        int storageSlots,
        Set<String> npcRoles,
        Set<String> capabilities,
        double taxMultiplier
) {

    public WorkspaceTier {
        level = Math.max(1, level);
        cost = org.robtic.minecraft.util.Robs.sanitise(cost);
        storageSlots = Math.max(0, storageSlots);
        npcRoles = Set.copyOf(npcRoles);
        capabilities = Set.copyOf(capabilities);
        taxMultiplier = taxMultiplier <= 0 || Double.isNaN(taxMultiplier) ? 1.0d : taxMultiplier;
    }

    /**
     * The tier used when configuration is missing or a workspace's level is out of range.
     *
     * Deliberately functional rather than empty: a workspace whose tier cannot be resolved should
     * still have storage and a seller, because the alternative is a player's business silently
     * ceasing to work because of a config edit.
     */
    public static final WorkspaceTier FALLBACK = new WorkspaceTier(
            1, "Workshop", 0d, 512,
            Set.of(WorkspaceNpcRole.SELLER),
            Set.of(),
            1.0d);

    public boolean has(String capability) {
        return capabilities.contains(capability.toLowerCase(Locale.ROOT));
    }

    public boolean staffs(String role) {
        return npcRoles.contains(role.toLowerCase(Locale.ROOT));
    }

    public static Optional<WorkspaceTier> parse(String key, ConfigurationSection body, Logger logger) {
        int level;

        try {
            level = Integer.parseInt(key.trim());
        } catch (NumberFormatException notANumber) {
            logger.warning("workspace.yml → tiers: \"" + key + "\" is not a level number and was ignored.");
            return Optional.empty();
        }

        if (level < 1) {
            logger.warning("workspace.yml → tiers: level " + level + " is below 1 and was ignored.");
            return Optional.empty();
        }

        return Optional.of(new WorkspaceTier(
                level,
                body.getString("display", "Tier " + level),
                org.robtic.minecraft.util.Robs.round(body.getDouble("cost", 0d)),
                body.getInt("storage", 512),
                lowercase(body.getStringList("npcs")),
                lowercase(body.getStringList("capabilities")),
                body.getDouble("tax-multiplier", 1.0d)));
    }

    /** Normalised on the way in, so casing in the config is never load-bearing. */
    private static Set<String> lowercase(List<String> values) {
        Set<String> normalised = new LinkedHashSet<>();
        values.forEach(value -> normalised.add(value.trim().toLowerCase(Locale.ROOT)));
        return normalised;
    }
}
