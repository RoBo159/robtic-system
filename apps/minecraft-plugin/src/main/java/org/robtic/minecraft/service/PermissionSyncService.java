package org.robtic.minecraft.service;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Reads LuckPerms groups, and applies a rank change made in game.
 *
 * The API itself is only referenced from {@link LuckPermsGroupApplier}, which is constructed after
 * the plugin has been confirmed present — so a server without LuckPerms loses group awareness and
 * nothing else.
 *
 * <h2>Groups flow outwards, never inwards</h2>
 *
 * LuckPerms is the authority on who holds which group. This service exposes {@link #groupsOf} so
 * the plugin can mirror that outwards to Discord, and it deliberately offers no way to apply a
 * group change that Discord decided. The previous two-way arrangement had both sides writing the
 * same state, and the last writer won regardless of which was correct.
 */
public final class PermissionSyncService {

    private final Plugin plugin;
    private final Logger logger;
    private final LuckPermsGroupApplier applier;

    public PermissionSyncService(Plugin plugin, boolean enabled) {
        this.plugin = plugin;
        this.logger = plugin.getLogger();

        if (!enabled) {
            this.applier = null;
            return;
        }

        if (Bukkit.getPluginManager().getPlugin("LuckPerms") == null) {
            logger.warning("Permission sync is enabled but LuckPerms is not installed — "
                    + "staff ranks and Discord role sync are both off.");
            this.applier = null;
            return;
        }

        this.applier = new LuckPermsGroupApplier(logger);
    }

    public boolean isEnabled() {
        return applier != null;
    }

    /**
     * The groups a player holds, lowercase, or an empty list when LuckPerms is absent.
     *
     * Hits LuckPerms storage, so it must not run on the server tick. Every caller is already on a
     * worker thread; this is documented rather than enforced because wrapping it in a scheduler
     * call would force the result to come back asynchronously and every consumer needs it inline.
     */
    public List<String> groupsOf(UUID uuid) {
        if (applier == null) {
            return List.of();
        }

        try {
            return applier.groupsOf(uuid);
        } catch (RuntimeException error) {
            logger.log(Level.WARNING, "Could not read LuckPerms groups for " + uuid, error);
            return List.of();
        }
    }

    /**
     * The groups of an already-loaded user, without touching storage. Safe on the server tick.
     *
     * Returns empty when LuckPerms has not loaded the user, which for a tick-bound caller means
     * "ask again later" rather than "this player holds nothing" — the two must not be confused, so
     * this deliberately does not collapse to an empty list.
     */
    public Optional<List<String>> loadedGroupsOf(UUID uuid) {
        if (applier == null) {
            return Optional.empty();
        }

        try {
            return applier.loadedGroupsOf(uuid);
        } catch (RuntimeException error) {
            logger.log(Level.FINE, "Could not read cached LuckPerms groups for " + uuid, error);
            return Optional.empty();
        }
    }

    /**
     * Registers a callback for any change to a player's groups.
     *
     * This is what lets the Discord mirror be event-driven: a `/lp user ... parent add` is noticed
     * the moment it happens, so nothing has to poll for it.
     */
    public void onGroupsChanged(Consumer<UUID> handler) {
        if (applier == null) {
            return;
        }

        try {
            applier.onGroupsChanged(plugin, handler);
        } catch (RuntimeException error) {
            logger.log(Level.WARNING, "Could not subscribe to LuckPerms group changes — "
                    + "role sync will fall back to the periodic reconcile", error);
        }
    }

    /**
     * Sets a player's rank group to exactly {@code target}, removing every other managed group.
     *
     * This is how `/staff promote|demote` changes a rank: LuckPerms is the authority, so the rank
     * change *is* the group change. A null or blank target removes the rank altogether.
     *
     * Staff mode does not use this. Entering and leaving `/admin` deliberately leaves groups alone
     * — the rank group is a permanent identity, not a permission held only while elevated.
     *
     * Runs synchronously on the calling thread, which must not be the server tick; the callers are
     * already on a worker because they are mid-API-call.
     */
    public boolean setRankGroup(UUID uuid, String target, Collection<String> managed) {
        if (applier == null) {
            return false;
        }

        try {
            applier.swapGroup(uuid, target, managed);
            return true;
        } catch (RuntimeException error) {
            logger.log(Level.WARNING, "LuckPerms rank change failed for " + uuid, error);
            return false;
        }
    }
}
