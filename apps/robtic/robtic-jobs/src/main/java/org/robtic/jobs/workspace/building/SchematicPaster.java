package org.robtic.jobs.workspace.building;

import org.bukkit.Location;

import java.nio.file.Path;
import java.util.function.Consumer;

/**
 * Something that can stamp a saved building into the world.
 *
 * <h2>An interface, so the paste backend is replaceable and absent-able</h2>
 *
 * WorldEdit and FastAsyncWorldEdit are the realistic implementations, and neither is required: a
 * server without one runs the whole business system perfectly, and base levels simply do not change
 * how the building looks. That is the same bargain every other optional dependency in this ecosystem
 * makes, and it is why this is a contract rather than a direct call into a library.
 *
 * It also means the reflective implementation that ships can be swapped for one compiled against
 * WorldEdit's API — see {@link WorldEditSchematicPaster} for why it is reflective today — without
 * anything above this line changing.
 *
 * <h2>Contract</h2>
 *
 * {@link #paste} is called on the main thread and must not block on it. An implementation that does
 * real work hands it to a scheduler or to the backend's own async pipeline, and calls back on the
 * main thread when it is finished.
 *
 * A failure is reported through the callback, never thrown. The caller has already committed the
 * upgrade by the time this runs — a paste that cannot happen costs the building its new appearance
 * and must never be able to unwind a player's purchase.
 */
public interface SchematicPaster {

    /** Whether a paste backend is installed and usable. */
    boolean available();

    /** A short name for the backend, for the one line logged at startup. */
    String describe();

    /**
     * Pastes a schematic so that its origin lands at a location.
     *
     * @param schematic the file, already checked to exist
     * @param at        where the schematic's own origin should end up
     * @param whenDone  called on the main thread; false when nothing was pasted
     */
    void paste(Path schematic, Location at, Consumer<Boolean> whenDone);

    /** The implementation used when no paste backend is installed. */
    SchematicPaster NONE = new SchematicPaster() {

        @Override
        public boolean available() {
            return false;
        }

        @Override
        public String describe() {
            return "none";
        }

        @Override
        public void paste(Path schematic, Location at, Consumer<Boolean> whenDone) {
            whenDone.accept(false);
        }
    };
}
