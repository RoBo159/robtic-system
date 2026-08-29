package org.robtic.premium;

import org.bukkit.plugin.Plugin;
import org.robtic.premium.config.PremiumSettings;
import org.robtic.core.entitlement.EntitlementSource;
import org.robtic.core.entitlement.Entitlements;
import org.robtic.core.service.PermissionSyncService;

import java.util.List;
import java.util.UUID;
import java.util.logging.Level;

/**
 * Applies the LuckPerms group a player's premium tier grants.
 *
 * <h2>Direction, and why this does not contradict the staff mirror</h2>
 *
 * Staff ranks flow Minecraft → Discord: the group is the authority and Discord reflects it.
 * Premium flows the other way, because a subscription is bought on Discord and the game server has
 * no way to know about it otherwise.
 *
 * Both can be true at once only because they touch disjoint sets. This service reads the tier from
 * the API — which resolved it from the member's Discord roles — and moves the player between the
 * groups named in premium.yml, and *only* those. A staff rank group is never in that list, so the
 * staff mirror and this can never write the same state.
 *
 * <h2>Applied at join, and on demand</h2>
 *
 * The tier is already fetched when the join warm-up runs, so applying it costs no extra request.
 * Re-applying is cheap and idempotent, which is what makes it safe to call again after a premium
 * change is announced.
 */
public final class PremiumSyncService {

    private final Plugin plugin;
    private final PermissionSyncService permissions;
    private final PremiumSettings settings;
    /** Whoever holds the entitlements — RobticEssentials, in practice. Never Essentials directly. */
    private final EntitlementSource entitlements;

    public PremiumSyncService(
            Plugin plugin,
            PermissionSyncService permissions,
            PremiumSettings settings,
            EntitlementSource entitlements
    ) {
        this.plugin = plugin;
        this.permissions = permissions;
        this.settings = settings;
        this.entitlements = entitlements;
    }

    /**
     * Brings a player's premium group in line with their tier. Off-thread only.
     *
     * A player with no tier has every premium group removed, which is what makes an expired
     * subscription actually take effect in game rather than lingering until somebody notices.
     */
    public void apply(UUID uuid) {
        if (!permissions.isEnabled() || settings.isEmpty()) {
            return;
        }

        try {
            Entitlements held = this.entitlements.load(uuid);
            List<String> managed = settings.managedGroups();

            // A null target removes every managed group without granting one — the free case.
            String target = held.luckPermsGroup();

            boolean applied = permissions.setRankGroup(uuid, target, managed);

            if (applied && target != null) {
                plugin.getLogger().fine("Applied premium group " + target + " to " + uuid);
            }
        } catch (RuntimeException error) {
            // Never fatal: failing to grant a perk must not stop somebody playing, and the next
            // join or /robtic refresh will try again.
            plugin.getLogger().log(Level.FINE, "Could not apply the premium group for " + uuid, error);
        }
    }

    /** Re-reads the tier and re-applies it, for a premium change announced while the player is on. */
    public void refresh(UUID uuid) {
        entitlements.invalidate(uuid);
        apply(uuid);
    }
}
