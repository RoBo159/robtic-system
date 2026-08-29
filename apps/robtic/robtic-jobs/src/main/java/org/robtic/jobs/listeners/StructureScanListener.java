package org.robtic.jobs.listeners;

import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.robtic.jobs.workspace.DiscoveryService;
import org.robtic.world.StructureMarkerSystem;
import org.robtic.world.events.StructureScannedEvent;

/**
 * The single join between RobticWorld's marker system and the profession system.
 *
 * <h2>One arrow, in one direction</h2>
 *
 * RobticWorld reads structures and announces them. It has never heard of a profession, a workspace or
 * a recruiter, and this listener is what keeps that true: everything this plugin knows about markers
 * arrives through {@link StructureScannedEvent} and nothing flows the other way. A dungeon system
 * added next year subscribes to the same event, looks for its own marker roles, and needs no change
 * here or there.
 *
 * Before this existed the event had no subscribers at all. RobticWorld scanned, validated, announced
 * into silence and then cleared the marker blocks, while this plugin ran a second scanner of its own
 * over the same chunks looking for a different, forgeable marker format. See {@link DiscoveryService}.
 *
 * <h2>MONITOR, and only successful scans</h2>
 *
 * The event is not cancellable, so MONITOR is about ordering rather than veto: adoption should happen
 * after anything else that wants to look at the report. A scan that failed validation is skipped —
 * it has no region, therefore no structure id, and RobticWorld has already put the reason in the log
 * in terms a builder can act on.
 */
public final class StructureScanListener implements Listener {

    private final StructureMarkerSystem markers;
    private final DiscoveryService discovery;

    public StructureScanListener(StructureMarkerSystem markers, DiscoveryService discovery) {
        this.markers = markers;
        this.discovery = discovery;
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onStructureScanned(StructureScannedEvent event) {
        if (!event.report().ok()) {
            return;
        }

        // The registry is read per event rather than captured, because a marker reload replaces the
        // types in it and a captured copy would resolve the recruiter role against the file as it was
        // when this plugin started.
        event.report().set().ifPresent(set -> discovery.adopt(set, markers.registry()));
    }
}
