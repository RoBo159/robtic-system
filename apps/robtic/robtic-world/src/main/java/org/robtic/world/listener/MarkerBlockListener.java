package org.robtic.world.listener;

import io.papermc.paper.event.player.PlayerOpenSignEvent;
import org.bukkit.GameMode;
import org.bukkit.block.Block;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;
import org.robtic.world.api.MarkerRegistry;
import org.robtic.world.api.MarkerType;
import org.robtic.world.api.PlacedMarker;
import org.robtic.world.config.MarkerSettings;
import org.robtic.world.events.MarkerPlacedEvent;
import org.robtic.world.item.MarkerItemFactory;
import org.robtic.core.util.Chat;

import java.util.Optional;
import java.util.function.Supplier;

/**
 * Moves marker data from the item onto the block, and back again.
 *
 * <h2>The data is written on placement, not carried by the item</h2>
 *
 * A marker item says which type it is. The block it becomes gets that, plus a freshly minted id —
 * see {@link MarkerItemFactory#stamp}. Doing it here rather than at item creation means a builder
 * who takes one marker from the menu and places it forty times gets forty individually addressable
 * markers, instead of forty markers all insisting they are the same one.
 */
public final class MarkerBlockListener implements Listener {

    private final Plugin plugin;
    private final MarkerRegistry registry;
    private final MarkerItemFactory items;
    private final Supplier<MarkerSettings> settings;

    public MarkerBlockListener(
            Plugin plugin,
            MarkerRegistry registry,
            MarkerItemFactory items,
            Supplier<MarkerSettings> settings
    ) {
        this.plugin = plugin;
        this.registry = registry;
        this.items = items;
        this.settings = settings;
    }

    /**
     * Stamps a freshly placed marker.
     *
     * Runs at {@link EventPriority#MONITOR} so that protection plugins have already had their say —
     * writing data onto a block another plugin is about to cancel would leave the world briefly
     * holding a marker that then vanishes.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        ItemStack used = event.getItemInHand();

        Optional<MarkerItemFactory.ItemMarker> read = items.readItem(used);

        if (read.isEmpty()) {
            return;
        }

        Optional<MarkerType> type = registry.get(read.get().typeId());

        if (type.isEmpty()) {
            event.getPlayer().sendMessage(Chat.component(
                    "&cThat marker's type (\"" + read.get().typeId() + "\") is not registered, so it"
                            + " was placed as an ordinary block. Get a fresh one from the marker menu."));
            return;
        }

        Block block = event.getBlockPlaced();

        MarkerPlacedEvent placed = new MarkerPlacedEvent(event.getPlayer(), block, type.get());
        plugin.getServer().getPluginManager().callEvent(placed);

        if (placed.isCancelled()) {
            block.setType(org.bukkit.Material.AIR, false);

            if (event.getPlayer().getGameMode() != GameMode.CREATIVE) {
                event.getPlayer().getInventory().addItem(used.clone());
            }

            return;
        }

        Optional<PlacedMarker> marker = items.stamp(block, type.get(), read.get().metadata());

        if (marker.isEmpty()) {
            // The configured marker material has no tile entity, so it cannot hold data. This is a
            // misconfiguration rather than a player mistake, and it would otherwise present as
            // markers that simply never appear in a scan.
            event.getPlayer().sendMessage(Chat.component(
                    "&cThis server's marker block (" + settings.get().blockMaterial()
                            + ") cannot store data. Ask an admin to set marker.block in markers.yml"
                            + " to a block with a block entity, such as a sign."));
            return;
        }

        event.getPlayer().sendMessage(Chat.component(
                "&8Placed &7" + type.get().display() + "&8 at "
                        + block.getX() + ", " + block.getY() + ", " + block.getZ() + "."));
    }

    /**
     * Returns the marker item when a marker is broken.
     *
     * Without this the block drops as a plain sign and the builder has lost the marker. Repositioning
     * one is the single most common thing a builder does, so it must not be destructive.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        MarkerSettings config = settings.get();
        Block block = event.getBlock();

        if (block.getType() != config.blockMaterial()) {
            return;
        }

        Optional<PlacedMarker> marker = items.read(block);

        if (marker.isEmpty()) {
            return;
        }

        Optional<MarkerType> type = registry.get(marker.get().typeId());

        event.setDropItems(false);

        if (type.isEmpty() || event.getPlayer().getGameMode() == GameMode.CREATIVE) {
            return;
        }

        block.getWorld().dropItemNaturally(
                block.getLocation(), items.create(type.get(), config.blockMaterial()));
    }

    /**
     * Stops the sign editor opening over a marker.
     *
     * Markers are waxed when they are stamped, which already prevents editing, but the editor still
     * opens for the player who placed the block. Cancelling it is the difference between placing a
     * marker and placing a marker then dismissing a text box every single time.
     */
    @EventHandler(ignoreCancelled = true)
    public void onOpenSign(PlayerOpenSignEvent event) {
        if (event.getSign().getBlock().getType() != settings.get().blockMaterial()) {
            return;
        }

        if (items.read(event.getSign().getBlock()).isPresent()) {
            event.setCancelled(true);
        }
    }
}
