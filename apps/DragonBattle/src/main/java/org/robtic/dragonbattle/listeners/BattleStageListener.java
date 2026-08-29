package org.robtic.dragonbattle.listeners;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.plugin.Plugin;
import org.robtic.dragonbattle.build.BeaconBuilder;
import org.robtic.dragonbattle.build.GatewayBuilder;
import org.robtic.dragonbattle.build.PortalBuilder;
import org.robtic.dragonbattle.cinematic.CinematicService;
import org.robtic.dragonbattle.config.MessageCatalog;
import org.robtic.dragonbattle.config.PluginSettings;
import org.robtic.dragonbattle.events.BattleStateChangeEvent;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.StoredLocation;
import org.robtic.dragonbattle.ritual.RitualSequence;

import java.util.List;

/**
 * Does the work each battle stage implies.
 *
 * <h2>Why this is a listener and not part of the state machine</h2>
 *
 * {@code BattleManager} sequences the fight: it knows that a death is followed by a portal and a
 * portal by a beacon, and nothing about what any of those are. Everything that actually touches the
 * world lives here, hanging off {@link BattleStateChangeEvent}.
 *
 * That separation is what makes the states configurable rather than merely named. An arena with
 * {@code generate-portal: false} still passes through {@code PORTAL_OPENING} — the sequence is
 * unchanged, and only this listener declines to build anything. Adding a boss phase, a loot drop or
 * a cutscene is a new listener rather than an edit to the machine.
 */
public final class BattleStageListener implements Listener {

    private final Plugin plugin;
    private final PortalBuilder portals;
    private final BeaconBuilder beacons;
    private final GatewayBuilder gateways;
    private final RitualSequence ritual;
    private final PluginSettings settings;
    private final CinematicService cinematics;
    private final MessageCatalog messages;

    public BattleStageListener(
            Plugin plugin,
            PortalBuilder portals,
            BeaconBuilder beacons,
            GatewayBuilder gateways,
            RitualSequence ritual,
            PluginSettings settings,
            CinematicService cinematics,
            MessageCatalog messages
    ) {
        this.plugin = plugin;
        this.portals = portals;
        this.beacons = beacons;
        this.gateways = gateways;
        this.ritual = ritual;
        this.settings = settings;
        this.cinematics = cinematics;
        this.messages = messages;
    }

    @EventHandler(priority = EventPriority.NORMAL)
    public void onStateChange(BattleStateChangeEvent event) {
        Arena arena = event.getArena();

        // First, and outside the switch: a cinematic is configured per state in cinematics.yml, so
        // every stage can have one — including the ones this listener does no other work for.
        // Failures there never reach the battle; see CinematicService.
        cinematics.play(arena, event.getCurrent());

        switch (event.getCurrent()) {
            case RESPAWN_ANIMATION -> {
                // The bar goes up before the animation, so "Dragon Awakening…" is on screen for the
                // whole countdown rather than appearing partway through it.
                arena.dragonSpawn()
                        .flatMap(StoredLocation::toBukkit)
                        .ifPresent(at -> event.getContext().bossBar()
                                .showAwakening(at.getWorld().getPlayers()));

                clearPreviousFight(arena);

                placeEgg(arena);
                ritual.play(arena, settings.spawnAnimationTicks());
            }

            case PORTAL_OPENING -> openPortal(arena);

            case BEACON_SPAWN -> beacons.build(arena);

            case GATEWAY_OPENING -> openGateways(arena, event);

            case COMPLETED -> announce(arena, "battle.completed");

            default -> {
                // Every other state is either presentational or handled by the machine itself.
            }
        }
    }

    /**
     * Takes down the previous fight's portal and beacon as the ritual begins.
     *
     * <h2>Why the ritual is what clears them</h2>
     *
     * The portal and beacon are the *reward* for the last dragon. Leaving them standing while a new
     * one is summoned means the arena accumulates them: a second portal cannot be built where one
     * already is, the beacon is already lit before anybody has fought for it, and the reward for
     * winning is a structure that was there anyway.
     *
     * Clearing at RESPAWN_ANIMATION rather than at the kill is deliberate — players get to keep and
     * use the portal for as long as nobody has started the next fight, which is the whole window in
     * which it is useful to them.
     *
     * Both clears remove only the blocks this plugin placed. See {@link PortalBuilder#clear}.
     */
    private void clearPreviousFight(Arena arena) {
        int removed = portals.clear(arena) + beacons.clear(arena);

        if (removed > 0) {
            plugin.getLogger().fine("Cleared " + removed + " block(s) of the previous fight's portal "
                    + "and beacon in arena \"" + arena.name() + "\".");
        }
    }

    /**
     * Puts the dragon egg at its configured position for the ritual.
     *
     * Only into air. The egg marks the ritual; it is not worth overwriting whatever an operator
     * built there, and a build eaten by a decoration would be the least defensible damage this
     * plugin could do.
     */
    private void placeEgg(Arena arena) {
        arena.egg()
                .flatMap(StoredLocation::toBukkit)
                .map(org.bukkit.Location::getBlock)
                .filter(block -> block.getType().isAir())
                .ifPresent(block -> block.setType(org.bukkit.Material.DRAGON_EGG, false));
    }

    private void openPortal(Arena arena) {
        portals.build(arena).ifPresent(result -> {
            if (!result.partial()) {
                return;
            }

            // Said out loud rather than swallowed. A portal that came out incomplete is something an
            // operator needs to know about — the alternative is players reporting a broken portal
            // and nobody knowing why it looks like that.
            plugin.getLogger().info("The portal in arena \"" + arena.name() + "\" placed "
                    + result.placed() + " block(s) and skipped " + result.skipped()
                    + " that were already occupied. Set portal-replace-mode to REPLACE_ALL if it "
                    + "should overwrite them.");
        });
    }

    private void openGateways(Arena arena, BattleStateChangeEvent event) {
        List<StoredLocation> opened = gateways.open(arena, event.getContext());

        if (opened.isEmpty() && !arena.gateways().isEmpty()) {
            plugin.getLogger().warning("No gateway opened in arena \"" + arena.name()
                    + "\" — every configured position is in a world that is not loaded.");
        }
    }

    /** Tells the players in the arena's world. Skipped when the world is not loaded. */
    private void announce(Arena arena, String key) {
        arena.dragonSpawn()
                .flatMap(StoredLocation::toBukkit)
                .ifPresent(location -> {
                    for (Player player : location.getWorld().getPlayers()) {
                        player.sendMessage(messages.prefixed(key, "arena", arena.name()));
                    }
                });
    }
}
