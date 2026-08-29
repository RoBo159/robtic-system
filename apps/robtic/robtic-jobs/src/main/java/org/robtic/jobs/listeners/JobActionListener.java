package org.robtic.jobs.listeners;

import org.bukkit.GameMode;
import org.bukkit.NamespacedKey;
import org.bukkit.block.Block;
import org.bukkit.block.data.Ageable;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityBreedEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.inventory.FurnaceExtractEvent;
import org.bukkit.event.player.PlayerFishEvent;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.robtic.jobs.jobs.JobAction;
import org.robtic.jobs.jobs.JobService;

/**
 * Turns things players do into {@link JobAction}s.
 *
 * <h2>This class names verbs, never professions</h2>
 *
 * It knows that breaking a block is {@code break:<material>} and that catching a fish is
 * {@code fish:<item>}. It does not know that Miner or Fisher exist, and adding a job requires no
 * change here. That is the seam described on {@link JobAction}, and it is what keeps "no hardcoded
 * profession logic" true in the one place it would be easiest to break.
 *
 * <h2>Anti-farming</h2>
 *
 * Two exploits are closed here rather than in the job system, because both are about the world
 * rather than about jobs:
 *
 * <ul>
 *   <li><b>Place-and-break.</b> A player placing stone and breaking it repeatedly would earn
 *       unlimited XP. Player-placed blocks are tagged and pay nothing when broken.</li>
 *   <li><b>Immature crops.</b> Breaking a seedling would count as a harvest, so only fully grown
 *       {@link Ageable} blocks pay.</li>
 * </ul>
 *
 * <h2>MONITOR and ignoreCancelled</h2>
 *
 * Every handler runs last and skips cancelled events, so a block break refused by a protection
 * plugin — or by this plugin's own workplace protection — never pays. Doing it at any earlier
 * priority would award XP for actions that did not actually happen.
 */
public final class JobActionListener implements Listener {

    /** Marks a block as player-placed, so breaking it earns nothing. */
    private final NamespacedKey placedKey;

    private final Plugin plugin;
    private final JobService jobs;

    public JobActionListener(Plugin plugin, JobService jobs) {
        this.plugin = plugin;
        this.jobs = jobs;
        this.placedKey = new NamespacedKey(plugin, "player_placed");
    }

    /**
     * Whether this player's actions should count at all.
     *
     * Creative and spectator are excluded because a creative player has infinite blocks, which would
     * make every reward meaningless in about four seconds.
     */
    private static boolean counts(Player player) {
        return player.getGameMode() == GameMode.SURVIVAL || player.getGameMode() == GameMode.ADVENTURE;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();

        if (!counts(player)) {
            return;
        }

        Block block = event.getBlock();

        if (wasPlacedByPlayer(block)) {
            // Placed by a player, so it pays nothing. The tag goes with the block when it breaks.
            clearPlacedTag(block);
            return;
        }

        // A crop broken before it is ripe is not a harvest. Checked here rather than in config
        // because it is a property of the block, not of any job's opinion about it.
        if (block.getBlockData() instanceof Ageable crop && crop.getAge() < crop.getMaximumAge()) {
            return;
        }

        jobs.award(player, JobAction.of("break", block.getType()));
    }

    /**
     * Tags placed blocks and awards {@code place:} XP.
     *
     * The tag is what makes place-and-break farming worthless. It is stored in the chunk's
     * persistent data rather than a map, so it survives restarts — a player could otherwise place a
     * thousand blocks, restart the server, and break them all for full value.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        Player player = event.getPlayer();

        if (!counts(player)) {
            return;
        }

        markPlacedByPlayer(event.getBlock());

        jobs.award(player, JobAction.of("place", event.getBlock().getType()));
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onFish(PlayerFishEvent event) {
        if (event.getState() != PlayerFishEvent.State.CAUGHT_FISH || !counts(event.getPlayer())) {
            return;
        }

        if (event.getCaught() instanceof org.bukkit.entity.Item item) {
            jobs.award(event.getPlayer(), JobAction.of("fish", item.getItemStack().getType()));
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onKill(EntityDeathEvent event) {
        Player killer = event.getEntity().getKiller();

        if (killer == null || !counts(killer)) {
            return;
        }

        jobs.award(killer, JobAction.of("kill", event.getEntityType()));
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreed(EntityBreedEvent event) {
        if (event.getBreeder() instanceof Player player && counts(player)) {
            jobs.award(player, JobAction.of("breed", event.getEntityType()));
        }
    }

    /**
     * Smelting, awarded when the result is taken out.
     *
     * On extraction rather than on smelting because that is the only point at which a player is
     * identified — a furnace runs unattended, and the person who lit it may be long gone.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onSmelt(FurnaceExtractEvent event) {
        if (!counts(event.getPlayer())) {
            return;
        }

        for (int index = 0; index < event.getItemAmount(); index++) {
            jobs.award(event.getPlayer(), JobAction.of("smelt", event.getItemType()));
        }
    }

    // ─── Player-placed tracking ───────────────────────────────────────────────────────────────

    /**
     * Records a placed block in its chunk's persistent data.
     *
     * Stored as a packed long per block in a byte array on the chunk. Chunk PDC persists to disk with
     * the region file, so the tag outlives restarts, and keeping it per chunk means the data unloads
     * with the chunk rather than growing forever in memory.
     */
    private void markPlacedByPlayer(Block block) {
        long packed = pack(block);

        long[] existing = block.getChunk().getPersistentDataContainer()
                .getOrDefault(placedKey, PersistentDataType.LONG_ARRAY, new long[0]);

        for (long value : existing) {
            if (value == packed) {
                return;
            }
        }

        long[] updated = java.util.Arrays.copyOf(existing, existing.length + 1);
        updated[existing.length] = packed;

        block.getChunk().getPersistentDataContainer()
                .set(placedKey, PersistentDataType.LONG_ARRAY, updated);
    }

    private boolean wasPlacedByPlayer(Block block) {
        long[] placed = block.getChunk().getPersistentDataContainer()
                .get(placedKey, PersistentDataType.LONG_ARRAY);

        if (placed == null || placed.length == 0) {
            return false;
        }

        long packed = pack(block);

        for (long value : placed) {
            if (value == packed) {
                return true;
            }
        }

        return false;
    }

    /**
     * Forgets a placed block once it has been broken.
     *
     * Without this the array only ever grows, and a long-lived building area would accumulate a tag
     * for every block ever placed there — including ones that no longer exist.
     */
    private void clearPlacedTag(Block block) {
        long[] placed = block.getChunk().getPersistentDataContainer()
                .get(placedKey, PersistentDataType.LONG_ARRAY);

        if (placed == null || placed.length == 0) {
            return;
        }

        long packed = pack(block);
        long[] filtered = new long[placed.length - 1];
        int index = 0;

        for (long value : placed) {
            if (value == packed) {
                continue;
            }

            if (index == filtered.length) {
                return;
            }

            filtered[index++] = value;
        }

        block.getChunk().getPersistentDataContainer()
                .set(placedKey, PersistentDataType.LONG_ARRAY, filtered);
    }

    /**
     * Packs a block's position within its chunk into a long.
     *
     * Chunk-relative, so 4 bits of x, 4 of z and the rest for y — comfortably within a long even for
     * the tallest world, and it means the value is stable regardless of where the chunk is.
     */
    private static long pack(Block block) {
        long x = block.getX() & 0xF;
        long z = block.getZ() & 0xF;
        long y = block.getY() + 2048L;

        return (y << 8) | (x << 4) | z;
    }
}
