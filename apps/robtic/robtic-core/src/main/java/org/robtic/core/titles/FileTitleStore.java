package org.robtic.core.titles;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.bukkit.plugin.Plugin;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.UnaryOperator;
import java.util.logging.Level;

/**
 * Titles on disk, one file per player, with a migration from the 3.x monolith.
 *
 * <h2>The migration, and why it is read-only against the old data</h2>
 *
 * RobticMinecraft 3.x wrote one file per player containing titles <em>and</em> professions:
 *
 * <pre>
 *   plugins/RobticMinecraft/progression/players/&lt;uuid&gt;.json
 *   { "titles": { "owned": [...], "equipped": "..." }, "jobs": { ... } }
 * </pre>
 *
 * When this store finds no file of its own for a player, it looks there, lifts the {@code titles}
 * object out and writes it to its own location. The legacy file is never modified and never deleted:
 * RobticJobs will read the same file for the professions half, and a server that rolls back to 3.x
 * finds its data exactly as it left it. Duplicated for the duration of the migration, which is the
 * correct trade against a one-way conversion that cannot be undone.
 *
 * The lookup happens once per player per session, only when no new-format file exists, so the cost
 * disappears the first time each player logs in after the upgrade.
 *
 * <h2>Threading</h2>
 *
 * {@link #load} and every write run off the main thread; reads are served from a concurrent map and
 * never touch the disk. A write is atomic — temp file then move — so a crash mid-save leaves the
 * previous version rather than a truncated one.
 */
public final class FileTitleStore implements TitleStore {

    /** Bumped when the on-disk shape changes. Written into every file so a future reader can adapt. */
    private static final int VERSION = 1;

    private final Plugin plugin;
    private final Path directory;
    private final Path legacyDirectory;

    private final Map<UUID, PlayerTitles> loaded = new ConcurrentHashMap<>();

    /**
     * @param directory       where this store keeps its files, normally {@code RobticCore/titles}
     * @param legacyDirectory the monolith's player directory, read during migration. May not exist,
     *                        which is the normal case on a fresh install
     */
    public FileTitleStore(Plugin plugin, Path directory, Path legacyDirectory) {
        this.plugin = plugin;
        this.directory = directory;
        this.legacyDirectory = legacyDirectory;
    }

    @Override
    public boolean isLoaded(UUID player) {
        return loaded.containsKey(player);
    }

    @Override
    public PlayerTitles titles(UUID player) {
        return loaded.getOrDefault(player, PlayerTitles.EMPTY);
    }

    @Override
    public void mutate(UUID player, UnaryOperator<PlayerTitles> change) {
        // Not loaded means not writable. Inventing a record here would overwrite whatever the player
        // actually owns the moment their real data arrives.
        PlayerTitles current = loaded.get(player);

        if (current == null) {
            return;
        }

        PlayerTitles next = change.apply(current);

        if (next == null || next.equals(current)) {
            return;
        }

        loaded.put(player, next);

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> save(player, next));
    }

    @Override
    public void load(UUID player) {
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            PlayerTitles titles = read(player).orElseGet(() -> migrate(player).orElse(PlayerTitles.EMPTY));

            loaded.put(player, titles);
        });
    }

    @Override
    public void unload(UUID player) {
        loaded.remove(player);
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    private Optional<PlayerTitles> read(UUID player) {
        Path file = directory.resolve(player + ".json");

        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }

        try {
            JsonObject root = JsonParser.parseString(
                    Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();

            return Optional.of(decode(root));
        } catch (IOException | RuntimeException unreadable) {
            // Reported and treated as absent rather than thrown. A corrupt file must not stop a
            // player joining, and the migration below will not fire for them because the file does
            // exist — so their titles are empty for this session and the file is left for inspection
            // rather than silently overwritten.
            plugin.getLogger().log(Level.WARNING,
                    "Could not read titles for " + player + "; treating as empty.", unreadable);

            return Optional.empty();
        }
    }

    /**
     * Lifts a player's titles out of the 3.x combined record.
     *
     * @return empty when there is no legacy file either, which is every player on a fresh install
     */
    private Optional<PlayerTitles> migrate(UUID player) {
        Path legacy = legacyDirectory.resolve(player + ".json");

        if (!Files.isRegularFile(legacy)) {
            return Optional.empty();
        }

        try {
            JsonObject root = JsonParser.parseString(
                    Files.readString(legacy, StandardCharsets.UTF_8)).getAsJsonObject();

            if (!root.has("titles") || !root.get("titles").isJsonObject()) {
                return Optional.empty();
            }

            PlayerTitles titles = decode(root.getAsJsonObject("titles"));

            // Written immediately so the legacy lookup happens once per player and not once per
            // login for the rest of the server's life.
            save(player, titles);

            plugin.getLogger().info("Migrated " + titles.owned().size() + " title(s) for " + player
                    + " from RobticMinecraft. The original file was not modified.");

            return Optional.of(titles);
        } catch (IOException | RuntimeException unreadable) {
            plugin.getLogger().log(Level.WARNING,
                    "Could not migrate titles for " + player + " from " + legacy
                            + ". Their titles will be empty; the original file is untouched.",
                    unreadable);

            return Optional.empty();
        }
    }

    /**
     * Decodes the {@code owned}/{@code equipped} shape.
     *
     * Deliberately identical in both formats — the migration is a move, not a conversion, so there
     * is one decoder rather than two that could drift apart.
     */
    private static PlayerTitles decode(JsonObject json) {
        Set<String> owned = new LinkedHashSet<>();

        if (json.has("owned") && json.get("owned").isJsonArray()) {
            JsonArray array = json.getAsJsonArray("owned");

            for (JsonElement element : array) {
                if (element.isJsonPrimitive()) {
                    owned.add(element.getAsString());
                }
            }
        }

        String equipped = json.has("equipped") && json.get("equipped").isJsonPrimitive()
                ? json.get("equipped").getAsString()
                : null;

        return new PlayerTitles(owned, Optional.ofNullable(equipped));
    }

    // ─── Writing ──────────────────────────────────────────────────────────────────────────────

    private void save(UUID player, PlayerTitles titles) {
        JsonObject root = new JsonObject();

        root.addProperty("version", VERSION);

        JsonArray owned = new JsonArray();
        titles.owned().forEach(owned::add);
        root.add("owned", owned);

        titles.equipped().ifPresent(id -> root.addProperty("equipped", id));

        try {
            Files.createDirectories(directory);

            Path target = directory.resolve(player + ".json");
            Path temporary = target.resolveSibling(target.getFileName() + ".tmp");

            Files.writeString(temporary, root.toString(), StandardCharsets.UTF_8);
            Files.move(temporary, target,
                    StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException failure) {
            plugin.getLogger().log(Level.SEVERE,
                    "Could not save titles for " + player + ".", failure);
        }
    }
}
