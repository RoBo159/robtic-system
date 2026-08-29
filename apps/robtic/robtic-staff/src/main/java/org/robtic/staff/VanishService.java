package org.robtic.staff;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;
import org.robtic.staff.config.StaffSettings;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;
import java.util.function.Supplier;

/**
 * `/hide` — invisibility to ordinary players, full visibility to staff.
 *
 * Implemented with Bukkit's own {@code hidePlayer}/{@code showPlayer} rather than a potion effect,
 * because only the former removes the player from the tab list and from other plugins' player
 * lookups. A potion effect leaves a visible name tag and an entry in TAB, which defeats the point.
 *
 * Visibility is re-evaluated whenever anyone joins and whenever anyone enters or leaves staff mode,
 * since either event changes who is allowed to see whom.
 */
public final class VanishService {

    private final Plugin plugin;
    private final StaffSettings settings;
    private final MessageCatalog messages;

    private final Set<UUID> vanished = ConcurrentHashMap.newKeySet();

    /** Supplies staff-mode membership, which decides who can see a vanished player. */
    private Predicate<UUID> staffModeCheck = uuid -> false;

    /** Re-applies every visibility rule at once. See {@link #applyVisibility}. */
    private volatile Runnable refreshVisibility = () -> {
    };

    /** Where vanishing puts you, or null when no admin gate is configured. */
    private volatile Supplier<Location> gate = () -> null;

    private volatile boolean teleportToGate;

    public VanishService(Plugin plugin, StaffSettings settings, MessageCatalog messages) {
        this.plugin = plugin;
        this.settings = settings;
        this.messages = messages;
    }

    public void bindStaffModeCheck(Predicate<UUID> check) {
        this.staffModeCheck = check;
    }

    /** Whether a player may see vanished staff. Read by the visibility service on the tick. */
    public boolean canSeeVanished(UUID uuid) {
        return staffModeCheck.test(uuid);
    }

    /** Registers the single visibility pass this service asks for rather than performing itself. */
    public void refreshVisibilityWith(Runnable action) {
        this.refreshVisibility = action;
    }

    /**
     * Registers where vanishing sends a staff member.
     *
     * A supplier rather than a location, because the gate is read from config.yml and `/staff gate`
     * rewrites it at runtime — holding the resolved value would pin whichever one was on disk at
     * startup.
     */
    public void teleportToGate(Supplier<Location> gateSupplier, boolean enabled) {
        this.gate = gateSupplier;
        this.teleportToGate = enabled;
    }

    public boolean isVanished(UUID uuid) {
        return vanished.contains(uuid);
    }

    public Set<UUID> vanishedPlayers() {
        return Set.copyOf(vanished);
    }

    /** Toggles and returns the new state. */
    public boolean toggle(Player player) {
        boolean nowVanished = !vanished.contains(player.getUniqueId());

        if (nowVanished) {
            vanished.add(player.getUniqueId());
        } else {
            vanished.remove(player.getUniqueId());
        }

        applyVisibility();

        // Moved out of sight as well as made invisible.
        //
        // Vanishing where you stand leaves an admin in the middle of whatever they were watching,
        // and the first thing they usually want is to be somewhere they can work from. The gate is
        // the same place `/admin` drops staff, so there is one "admin base" rather than two.
        if (nowVanished && teleportToGate && gate.get() != null) {
            player.teleport(gate.get());
            player.sendMessage(messages.prefixed("vanish.moved-to-gate"));
        }

        player.sendMessage(messages.prefixed(nowVanished ? "vanish.enabled" : "vanish.disabled"));

        return nowVanished;
    }

    public void setVanished(Player player, boolean value) {
        if (value) {
            vanished.add(player.getUniqueId());
        } else {
            vanished.remove(player.getUniqueId());
        }
        applyVisibility();
    }

    /**
     * Recomputes who can see whom.
     *
     * <h2>Delegated, not computed here</h2>
     *
     * This used to run its own pass over every pair, calling {@code showPlayer} for anyone allowed
     * to see the target. That was correct in isolation and wrong in company: the lobby, AFK and
     * authentication all decide visibility too, and each pass overwrote the last. A vanished staff
     * member became visible again the moment anybody went AFK, because that pass knew nothing about
     * vanish and cheerfully called {@code showPlayer} on them.
     *
     * {@link org.robtic.core.lobby.PlayerVisibilityService} now owns the question and is given
     * the vanish rules as predicates, so all four features are one expression and none can undo
     * another.
     *
     * <h2>The tab list</h2>
     *
     * Nothing here touches it, because {@code hidePlayer} already removes the tab entry along with
     * the entity — that is exactly why this feature uses it rather than an invisibility effect.
     */
    public void applyVisibility() {
        refreshVisibility.run();

        if (!settings.vanishHideFromTab()) {
            return;
        }

        for (Player target : Bukkit.getOnlinePlayers()) {
            // Not a tab-list call, despite living under the `hide-from-tab` setting: it stops a
            // vanished admin counting towards the sleep vote, so a hidden staff member standing in
            // a bedroom cannot silently block the night from passing.
            target.setSleepingIgnored(vanished.contains(target.getUniqueId()));
        }
    }

    /** Whether a join or quit message should be suppressed for this player. */
    public boolean shouldSuppressConnectionMessage(UUID uuid) {
        return settings.vanishSuppressJoinQuit() && vanished.contains(uuid);
    }

    /** Clears state on quit so a rejoining player is not invisible without knowing it. */
    public void forget(UUID uuid) {
        vanished.remove(uuid);
    }
}
