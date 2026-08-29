package org.robtic.dragonbattle.region;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.configuration.ConfigurationSection;

import java.util.HashSet;
import java.util.Set;

/**
 * Remembers which blocks in an arena were put there by players, and are therefore the dragon's to
 * destroy.
 *
 * <h2>Natural is the default; only the exception is stored</h2>
 *
 * The obvious design is to scan the arena once and record every block as natural. It does not
 * survive contact with a real arena: a 256×128×256 cuboid is 8.3 million blocks, which is roughly
 * 380 MB of set entries, a six-second main-thread freeze to walk, and a file nobody can open.
 *
 * Inverting it costs nothing and behaves identically. "Natural" is simply <em>not in this set</em>,
 * so the only thing stored is what a player added — a few hundred entries on a busy arena. There is
 * no scan, no repeating task, and the file stays readable.
 *
 * It also fails in the right direction. Anything already standing when the plugin was installed is
 * unknown to this set and therefore protected, which is exactly what "the original structure is
 * protected forever" asks for.
 *
 * <h2>What can never be broken, whoever placed it</h2>
 *
 * A short blacklist sits in front of the set. A player who walls the portal in bedrock — or places a
 * block that later becomes part of the exit structure — must not thereby hand the dragon a way to
 * dismantle the arena's fixed geometry.
 */
public final class BuildTracker {

    /**
     * Never destructible, regardless of who placed it.
     *
     * These are the blocks the fight itself depends on. A dragon that broke the portal would leave
     * players with no way out of the End and no way to trigger another fight.
     */
    private static final Set<Material> PROTECTED = Set.of(
            Material.BEDROCK,
            Material.END_PORTAL,
            Material.END_PORTAL_FRAME,
            Material.END_GATEWAY,
            Material.DRAGON_EGG,
            Material.BEACON,
            Material.COMMAND_BLOCK,
            Material.CHAIN_COMMAND_BLOCK,
            Material.REPEATING_COMMAND_BLOCK,
            Material.STRUCTURE_BLOCK,
            Material.BARRIER,
            Material.LIGHT
    );

    /**
     * Player-placed positions, packed into longs.
     *
     * A {@code Location} per entry would carry a world reference and three doubles for what is three
     * integers; packing keeps a few thousand entries to a few tens of kilobytes and makes the
     * contains-check a primitive comparison rather than an object equals.
     */
    private final Set<Long> playerBlocks = new HashSet<>();

    /**
     * Packs a block position into a single long.
     *
     * 26 bits for each horizontal axis and 12 for the vertical, which is the layout Minecraft itself
     * uses for block positions — enough for the full world height and ±33 million blocks out.
     */
    private static long key(int x, int y, int z) {
        return ((long) (x & 0x3FFFFFF) << 38) | ((long) (z & 0x3FFFFFF) << 12) | (y & 0xFFF);
    }

    private static long key(Block block) {
        return key(block.getX(), block.getY(), block.getZ());
    }

    /** Records a block a player placed. */
    public void onPlaced(Block block) {
        playerBlocks.add(key(block));
    }

    /**
     * Forgets a block a player removed.
     *
     * Covers the replacement case on its own: breaking a natural block is a no-op here, and placing
     * something in the hole marks it as the player's. Nothing has to detect "replaced" as a distinct
     * event, which is one fewer thing to get wrong.
     */
    public void onRemoved(Block block) {
        playerBlocks.remove(key(block));
    }

    /**
     * Whether the dragon may destroy this block.
     *
     * The blacklist is checked first, so a protected material is refused even when a player placed
     * it — see the class note.
     */
    public boolean mayBreak(Block block) {
        if (PROTECTED.contains(block.getType())) {
            return false;
        }

        return playerBlocks.contains(key(block));
    }

    public boolean isPlayerBuilt(Location location) {
        return playerBlocks.contains(key(location.getBlockX(), location.getBlockY(), location.getBlockZ()));
    }

    /** How many player blocks are tracked, for `/dragonbattle info`. */
    public int size() {
        return playerBlocks.size();
    }

    /** Forgets everything, for an arena whose bounds changed. */
    public void clear() {
        playerBlocks.clear();
    }

    // ─── Persistence ──────────────────────────────────────────────────────────────────────────

    /**
     * Written as packed longs rather than as readable coordinates.
     *
     * A thousand entries of {@code "world,x,y,z"} is a wall of text an operator cannot act on
     * anyway; the list exists for the plugin, not for reading. Positions are recoverable with
     * {@link #unpack} if one ever needs inspecting.
     */
    public void write(ConfigurationSection section) {
        section.set("player-blocks", playerBlocks.stream().toList());
    }

    public void read(ConfigurationSection section) {
        playerBlocks.clear();

        if (section == null) {
            return;
        }

        playerBlocks.addAll(section.getLongList("player-blocks"));
    }

    /** The x, y, z a packed key encodes. For diagnostics. */
    public static int[] unpack(long packed) {
        int x = (int) (packed >> 38);
        int y = (int) (packed & 0xFFF);
        int z = (int) (packed << 26 >> 38);

        return new int[]{x, y, z};
    }
}
