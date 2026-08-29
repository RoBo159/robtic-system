package org.robtic.dragonbattle.build;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.robtic.dragonbattle.model.ArenaSettings;

import java.util.Set;

/**
 * The one place that decides whether a block may be overwritten.
 *
 * <h2>Why this is its own type</h2>
 *
 * The portal, the beacon and the gateways all build into a world somebody else made, and all three
 * face the same question on every block: is something already here, and am I allowed to destroy it?
 * Answering that in three places would mean three chances to get it wrong, and the failure is not
 * subtle — it is a hole in a build that no command can undo.
 *
 * <h2>AIR_ONLY is the default everywhere</h2>
 *
 * An arena is nearly always a build. A portal that ate part of it is damage an operator discovers
 * after the fact, so the mode that preserves work is the one you get without asking, and destroying
 * anything is opt-in.
 */
public final class BlockPlacer {

    private final ArenaSettings.PortalReplaceMode mode;
    private final Set<Material> whitelist;

    /** Counted so a caller can report how much of what it wanted to build actually landed. */
    private int placed;
    private int skipped;

    public BlockPlacer(ArenaSettings.PortalReplaceMode mode, Set<Material> whitelist) {
        this.mode = mode;
        this.whitelist = whitelist;
    }

    /**
     * Places a block if the mode allows it.
     *
     * @return true when the block was changed
     */
    public boolean place(Location location, Material material) {
        Block block = location.getBlock();

        if (!mayReplace(block.getType())) {
            skipped++;
            return false;
        }

        block.setType(material, false);
        placed++;
        return true;
    }

    /** Whether a block of this type may be overwritten under the current mode. */
    public boolean mayReplace(Material existing) {
        return switch (mode) {
            case REPLACE_ALL -> true;
            case AIR_ONLY -> existing.isAir();
            // Air is always replaceable in whitelist mode too. An operator listing materials is
            // naming what may be *destroyed*; requiring them to also remember AIR would make the
            // common case fail for a reason that reads as a bug.
            case WHITELIST -> existing.isAir() || whitelist.contains(existing);
        };
    }

    public int placedCount() {
        return placed;
    }

    public int skippedCount() {
        return skipped;
    }

    /** True when something was in the way, so the caller can say so rather than claiming success. */
    public boolean anySkipped() {
        return skipped > 0;
    }
}
