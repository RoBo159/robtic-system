package org.robtic.jobs.workspace.building;

import org.bukkit.Location;
import org.bukkit.plugin.Plugin;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.Consumer;
import java.util.logging.Level;

/**
 * Pastes through WorldEdit or FastAsyncWorldEdit, reached reflectively.
 *
 * <h2>Why reflection rather than a compile-time dependency</h2>
 *
 * Two reasons, and the second is the one that would survive a code review on its own.
 *
 * The first is practical: WorldEdit is not on this project's dependency path, and adding it makes
 * every build of RobticJobs need a third-party repository for a feature that is optional at runtime.
 *
 * The second is the ecosystem's own rule. No feature plugin here imports another project's library
 * directly — Discord is reached through {@code DiscordService}, mail through {@code MailSender},
 * NPCs through {@code NpcProvider}. Each of those is an interface with a do-nothing implementation,
 * and the concrete binding lives in exactly one class that is allowed to know the library exists.
 * {@link SchematicPaster} is that interface and this is that one class.
 *
 * <h2>What this costs, stated plainly</h2>
 *
 * Reflection cannot be checked by the compiler, so a WorldEdit release that renames a method turns a
 * build error into a runtime one. That is mitigated, not solved: every lookup happens once at
 * construction, and a single missing piece disables the whole backend with one explanatory line
 * rather than throwing on the first upgrade somebody buys. A server operator sees "schematic pasting
 * is unavailable" at startup, not a stack trace three weeks later.
 *
 * If WorldEdit is ever added to the build properly, this class is the only one that changes.
 *
 * <h2>Threading</h2>
 *
 * Reading the file is I/O and happens on a worker. The paste itself is pushed back to the main
 * thread: WorldEdit's own edit sessions are safe there, and FAWE's are safe anywhere — targeting the
 * stricter of the two is what lets one class serve both.
 */
public final class WorldEditSchematicPaster implements SchematicPaster {

    private final Plugin plugin;

    /** Null when anything below could not be resolved; see {@link #available()}. */
    private final Bindings bindings;

    private final String backend;

    /**
     * Every reflective handle, resolved once.
     *
     * A record so the "all or nothing" property is structural: either the whole set was found and
     * the backend works, or the field is null and the backend is absent. There is no half-bound
     * state in which some pastes work.
     */
    private record Bindings(
            Method findByFile,
            Method getReader,
            Method read,
            Method adaptWorld,
            Method newEditSession,
            Method blockVectorAt,
            Method createPaste,
            Method to,
            Method ignoreAirBlocks,
            Method buildPaste,
            Method complete,
            Method closeSession,
            Object worldEditInstance,
            Class<?> clipboardHolder
    ) {
    }

    public WorldEditSchematicPaster(Plugin plugin) {
        this.plugin = plugin;

        boolean fawe = plugin.getServer().getPluginManager().getPlugin("FastAsyncWorldEdit") != null;
        boolean worldEdit = plugin.getServer().getPluginManager().getPlugin("WorldEdit") != null;

        this.backend = fawe ? "FastAsyncWorldEdit" : worldEdit ? "WorldEdit" : "none";
        this.bindings = fawe || worldEdit ? resolve() : null;
    }

    /**
     * Finds everything needed for a paste, or nothing.
     *
     * @return null when any piece is missing, which disables the backend rather than leaving it to
     *         fail later on a player's upgrade
     */
    private Bindings resolve() {
        try {
            Class<?> formats = Class.forName("com.sk89q.worldedit.extent.clipboard.io.ClipboardFormats");
            Class<?> format = Class.forName("com.sk89q.worldedit.extent.clipboard.io.ClipboardFormat");
            Class<?> reader = Class.forName("com.sk89q.worldedit.extent.clipboard.io.ClipboardReader");
            Class<?> adapter = Class.forName("com.sk89q.worldedit.bukkit.BukkitAdapter");
            Class<?> worldEdit = Class.forName("com.sk89q.worldedit.WorldEdit");
            Class<?> world = Class.forName("com.sk89q.worldedit.world.World");
            Class<?> vector = Class.forName("com.sk89q.worldedit.math.BlockVector3");
            Class<?> holder = Class.forName("com.sk89q.worldedit.session.ClipboardHolder");
            Class<?> builder = Class.forName("com.sk89q.worldedit.function.operation.Operation");
            Class<?> operations = Class.forName("com.sk89q.worldedit.function.operation.Operations");
            Class<?> extent = Class.forName("com.sk89q.worldedit.extent.Extent");
            Class<?> pasteBuilder = Class.forName("com.sk89q.worldedit.session.PasteBuilder");
            Class<?> session = Class.forName("com.sk89q.worldedit.EditSession");

            return new Bindings(
                    formats.getMethod("findByFile", java.io.File.class),
                    format.getMethod("getReader", InputStream.class),
                    reader.getMethod("read"),
                    adapter.getMethod("adapt", org.bukkit.World.class),
                    worldEdit.getMethod("newEditSession", world),
                    vector.getMethod("at", int.class, int.class, int.class),
                    holder.getMethod("createPaste", extent),
                    pasteBuilder.getMethod("to", vector),
                    pasteBuilder.getMethod("ignoreAirBlocks", boolean.class),
                    pasteBuilder.getMethod("build"),
                    operations.getMethod("complete", builder),
                    session.getMethod("close"),
                    worldEdit.getMethod("getInstance").invoke(null),
                    holder);
        } catch (ReflectiveOperationException | RuntimeException | LinkageError missing) {
            // One line, at startup, naming what is off and what it costs. Deliberately not SEVERE:
            // a server without schematic pasting is a supported configuration, and the only thing
            // lost is that buildings do not change shape when a base level is reached.
            plugin.getLogger().warning("A paste backend (" + backend + ") is installed, but this"
                    + " build could not bind to its API (" + missing.getMessage() + "). Base-level"
                    + " schematics will not be pasted; every other part of the business system works"
                    + " normally.");
            return null;
        }
    }

    @Override
    public boolean available() {
        return bindings != null;
    }

    @Override
    public String describe() {
        return bindings == null ? "none" : backend;
    }

    @Override
    public void paste(Path schematic, Location at, Consumer<Boolean> whenDone) {
        if (bindings == null || at.getWorld() == null) {
            whenDone.accept(false);
            return;
        }

        // Reading the file is I/O and does not belong on the tick. The clipboard it produces is an
        // ordinary object, so carrying it back to the main thread is safe.
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            Object clipboard;

            try {
                clipboard = readClipboard(schematic);
            } catch (ReflectiveOperationException | java.io.IOException
                     | RuntimeException | LinkageError failure) {
                plugin.getLogger().log(Level.WARNING, "Could not read the schematic "
                        + schematic.getFileName() + ". The building was left as it was.", failure);
                plugin.getServer().getScheduler().runTask(plugin, () -> whenDone.accept(false));
                return;
            }

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                boolean pasted = pasteOnMainThread(clipboard, at, schematic);
                whenDone.accept(pasted);
            });
        });
    }

    private Object readClipboard(Path schematic) throws ReflectiveOperationException, java.io.IOException {
        Object format = bindings.findByFile().invoke(null, schematic.toFile());

        if (format == null) {
            throw new IllegalStateException("no clipboard format recognises " + schematic.getFileName());
        }

        try (InputStream stream = Files.newInputStream(schematic)) {
            Object reader = bindings.getReader().invoke(format, stream);

            // The reader holds the stream, so the clipboard has to be fully read before the
            // try-with-resources closes it. read() does exactly that.
            return bindings.read().invoke(reader);
        }
    }

    private boolean pasteOnMainThread(Object clipboard, Location at, Path schematic) {
        Object session = null;

        try {
            Object world = bindings.adaptWorld().invoke(null, at.getWorld());
            session = bindings.newEditSession().invoke(bindings.worldEditInstance(), world);

            Object target = bindings.blockVectorAt().invoke(
                    null, at.getBlockX(), at.getBlockY(), at.getBlockZ());

            Object holder = bindings.clipboardHolder()
                    .getConstructor(Class.forName("com.sk89q.worldedit.extent.clipboard.Clipboard"))
                    .newInstance(clipboard);

            Object builder = bindings.createPaste().invoke(holder, session);
            builder = bindings.to().invoke(builder, target);

            // Air is pasted, not skipped. A base level replaces the previous building, and skipping
            // air would leave the old walls standing inside the new ones — which is the single most
            // visible way this could go wrong.
            builder = bindings.ignoreAirBlocks().invoke(builder, false);

            bindings.complete().invoke(null, bindings.buildPaste().invoke(builder));

            return true;
        } catch (ReflectiveOperationException | RuntimeException | LinkageError failure) {
            plugin.getLogger().log(Level.WARNING, "Could not paste the schematic "
                    + schematic.getFileName() + " at " + at.getBlockX() + ", " + at.getBlockY()
                    + ", " + at.getBlockZ() + ". The upgrade itself is unaffected — the building"
                    + " simply still looks like the previous level.", failure);
            return false;
        } finally {
            // Closing is what flushes the edit and files it in the history. A session left open
            // leaks, and on FAWE the paste may never land at all.
            if (session != null) {
                try {
                    bindings.closeSession().invoke(session);
                } catch (ReflectiveOperationException | RuntimeException | LinkageError ignored) {
                    // Nothing useful to do, and the paste itself has already been reported.
                }
            }
        }
    }
}
