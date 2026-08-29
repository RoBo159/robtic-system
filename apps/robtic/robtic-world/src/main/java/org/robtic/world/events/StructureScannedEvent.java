package org.robtic.world.events;

import org.bukkit.event.Event;
import org.bukkit.event.HandlerList;
import org.robtic.world.scan.ScanReport;

/**
 * Fired once a structure's markers have been read and validated.
 *
 * <h2>This is the seam every future structure hangs off</h2>
 *
 * The marker system's job ends here. It found a building, read what the builder put in it, checked
 * it and produced a {@link ScanReport}. What that building <em>is</em> — a workspace, a dungeon, a
 * guild hall — is somebody else's decision, and they make it by listening for this.
 *
 * That is what keeps this module free of the word "workspace". A future system adds its marker types
 * to the registry, listens here, and looks for the ones it cares about.
 *
 * <h2>Fired for failures too</h2>
 *
 * A report whose {@link ScanReport#ok()} is false still raises this event. A listener that only
 * cares about usable structures checks that flag; one that wants to warn an admin about a broken
 * building in their world needs to hear about exactly the ones that failed.
 *
 * Not cancellable: by the time this fires the reading has already happened, and there is nothing
 * left to call off. A listener that wants to reject a structure simply does not act on it.
 */
public final class StructureScannedEvent extends Event {

    private static final HandlerList HANDLERS = new HandlerList();

    private final ScanReport report;
    private final boolean automatic;

    /**
     * @param automatic whether this came from a structure generating, as opposed to somebody running
     *                  a command — a listener that registers workspaces wants the first and not the
     *                  second, and cannot otherwise tell them apart
     */
    public StructureScannedEvent(ScanReport report, boolean automatic) {
        this.report = report;
        this.automatic = automatic;
    }

    public ScanReport report() {
        return report;
    }

    public boolean automatic() {
        return automatic;
    }

    @Override
    public HandlerList getHandlers() {
        return HANDLERS;
    }

    public static HandlerList getHandlerList() {
        return HANDLERS;
    }
}
