package org.robtic.jobs.storage;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;
import org.robtic.jobs.workspace.Workspace;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;
import java.util.stream.Stream;

/**
 * Progression stored as JSON files under the plugin folder.
 *
 * <h2>What this is for</h2>
 *
 * It is the backend that works on day one, before the corresponding API endpoints exist, and the one
 * a standalone server can use without a shared database. It is also the fallback an operator can
 * switch to if the API is having a bad week — progression keeps working, locally, and the files can
 * be migrated later because both backends speak the same {@link ProgressionCodec} format.
 *
 * <h2>Writes are atomic</h2>
 *
 * Every save is written to a temporary file and then moved over the real one. A server killed
 * mid-write therefore finds either the old complete file or the new complete file, never a truncated
 * one. Writing in place is how a crash during a save turns one player's progression into an
 * unparseable half-record — and since saves happen on quit, a crash is exactly when they are most
 * likely to be running.
 *
 * <h2>Threading</h2>
 *
 * Called only from {@link ProgressionRepository}'s workers. Per-player files need no coordination
 * because a player exists on one server at a time; the workspace index is a single shared file and
 * is guarded by a lock.
 */
public final class FileProgressionStorage implements ProgressionStorage {

    private final Path playersDirectory;
    private final Path workspacesFile;
    private final Logger logger;
    private final Object workspaceLock = new Object();

    public FileProgressionStorage(Path root, Logger logger) {
        this.playersDirectory = root.resolve("players");
        this.workspacesFile = root.resolve("workspaces.json");
        this.logger = logger;
    }

    @Override
    public String describe() {
        return "local files (" + playersDirectory.getParent().getFileName() + ")";
    }

    @Override
    public PlayerProgression load(UUID playerId) throws StorageException {
        Path file = playersDirectory.resolve(playerId + ".json");

        if (!Files.isRegularFile(file)) {
            // A player who has never played is not an error, and must not be reported as one — the
            // repository would otherwise refuse to save them, and no new player could ever progress.
            return PlayerProgression.EMPTY;
        }

        try {
            String text = Files.readString(file, StandardCharsets.UTF_8);
            return ProgressionCodec.decode(JsonParser.parseString(text).getAsJsonObject());
        } catch (IOException unreadable) {
            throw new StorageException("Could not read " + file.getFileName(), unreadable);
        } catch (JsonSyntaxException | IllegalStateException corrupt) {
            // Corruption is reported as a failure rather than swallowed as "no data". The repository
            // then refuses to overwrite it, which preserves the file for an operator to inspect
            // instead of replacing a recoverable record with an empty one on the next save.
            throw new StorageException("Progression file " + file.getFileName()
                    + " is corrupt and was not overwritten", corrupt);
        }
    }

    @Override
    public void save(UUID playerId, PlayerProgression progression) throws StorageException {
        try {
            Files.createDirectories(playersDirectory);
            writeAtomically(playersDirectory.resolve(playerId + ".json"),
                    ProgressionCodec.encode(progression).toString());
        } catch (IOException failed) {
            throw new StorageException("Could not save progression for " + playerId, failed);
        }
    }

    @Override
    public List<Workspace> loadWorkspaces() throws StorageException {
        synchronized (workspaceLock) {
            if (!Files.isRegularFile(workspacesFile)) {
                return List.of();
            }

            try {
                String text = Files.readString(workspacesFile, StandardCharsets.UTF_8);
                JsonArray array = JsonParser.parseString(text).getAsJsonArray();

                List<Workspace> workspaces = new ArrayList<>(array.size());
                int skipped = 0;

                for (JsonElement element : array) {
                    if (!element.isJsonObject()) {
                        skipped++;
                        continue;
                    }

                    // One bad entry is dropped, not fatal. Losing a single workspace claim is
                    // recoverable by an admin; failing the whole load would unprotect every
                    // workspace on the server at once.
                    Workspace parsed = Workspace.fromJson(element.getAsJsonObject()).orElse(null);

                    if (parsed == null) {
                        skipped++;
                    } else {
                        workspaces.add(parsed);
                    }
                }

                if (skipped > 0) {
                    logger.warning("Skipped " + skipped + " unreadable workspace record(s) in "
                            + workspacesFile.getFileName() + ".");
                }

                return workspaces;
            } catch (IOException unreadable) {
                throw new StorageException("Could not read workspaces", unreadable);
            } catch (JsonSyntaxException | IllegalStateException corrupt) {
                throw new StorageException("The workspace index is corrupt", corrupt);
            }
        }
    }

    /**
     * Rewrites the whole index.
     *
     * A full rewrite for a single claim is wasteful in principle and irrelevant in practice: there
     * are hundreds of workspaces, claims happen a few times a day, and the alternative — an append
     * log needing compaction — is a great deal of machinery to save a few kilobytes.
     */
    @Override
    public void saveWorkspace(Workspace workspace) throws StorageException {
        synchronized (workspaceLock) {
            List<Workspace> all = new ArrayList<>(loadWorkspaces());
            all.removeIf(existing -> existing.id().equals(workspace.id()));
            all.add(workspace);
            writeWorkspaces(all);
        }
    }

    /**
     * Saves a batch in one rewrite.
     *
     * Overridden because the default loops, and every iteration of that loop re-reads and rewrites
     * the whole index — so saving every workspace at shutdown would read and write the file once per
     * workspace. Merged into what is already on disk rather than replacing it, so a batch that does
     * not name every workspace cannot delete the ones it left out.
     */
    @Override
    public void saveWorkspaces(List<Workspace> workspaces) throws StorageException {
        if (workspaces.isEmpty()) {
            return;
        }

        synchronized (workspaceLock) {
            Map<String, Workspace> merged = new LinkedHashMap<>();

            loadWorkspaces().forEach(existing -> merged.put(existing.id(), existing));
            workspaces.forEach(workspace -> merged.put(workspace.id(), workspace));

            writeWorkspaces(List.copyOf(merged.values()));
        }
    }

    @Override
    public void deleteWorkspace(String workspaceId) throws StorageException {
        synchronized (workspaceLock) {
            List<Workspace> all = new ArrayList<>(loadWorkspaces());

            if (all.removeIf(existing -> existing.id().equals(workspaceId))) {
                writeWorkspaces(all);
            }
        }
    }

    private void writeWorkspaces(List<Workspace> workspaces) throws StorageException {
        JsonArray array = new JsonArray();
        workspaces.forEach(workspace -> array.add(workspace.toJson()));

        try {
            Files.createDirectories(workspacesFile.getParent());
            writeAtomically(workspacesFile, array.toString());
        } catch (IOException failed) {
            throw new StorageException("Could not save workspaces", failed);
        }
    }

    /**
     * Writes through a temporary file and moves it into place.
     *
     * Falls back to a non-atomic move when the filesystem cannot do it — some Windows and network
     * filesystems cannot — because a slightly weaker guarantee is better than refusing to save.
     */
    private void writeAtomically(Path target, String content) throws IOException {
        Path temporary = target.resolveSibling(target.getFileName() + ".tmp");

        Files.writeString(temporary, content, StandardCharsets.UTF_8);

        try {
            Files.move(temporary, target,
                    StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException notSupported) {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** Every player id with a stored file, for admin tooling and migration. */
    public List<UUID> storedPlayers() {
        if (!Files.isDirectory(playersDirectory)) {
            return List.of();
        }

        try (Stream<Path> files = Files.list(playersDirectory)) {
            return files
                    .map(path -> path.getFileName().toString())
                    .filter(name -> name.endsWith(".json"))
                    .map(name -> name.substring(0, name.length() - 5))
                    .map(name -> {
                        try {
                            return UUID.fromString(name);
                        } catch (IllegalArgumentException notAUuid) {
                            return null;
                        }
                    })
                    .filter(java.util.Objects::nonNull)
                    .toList();
        } catch (IOException | UncheckedIOException unreadable) {
            logger.warning("Could not list stored progression files: " + unreadable.getMessage());
            return List.of();
        }
    }
}
