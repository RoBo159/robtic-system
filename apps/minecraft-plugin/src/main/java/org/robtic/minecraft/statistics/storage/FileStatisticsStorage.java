package org.robtic.minecraft.statistics.storage;

import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

/**
 * Statistics stored as one JSON file per player under the plugin folder.
 *
 * <h2>A file per player, unlike the workspace index</h2>
 *
 * Workspaces are a few hundred server-wide records and live in one file. Statistics are per player
 * and there may be tens of thousands of them, so a single index would have to be read and rewritten
 * in full for every save — the same mistake, at a scale where it would actually hurt. Per-player
 * files also need no coordination: a player exists on one server at a time, so two writers for one
 * file is not a state that arises.
 *
 * <h2>Writes are atomic</h2>
 *
 * Written to a temporary file and moved over the real one, so a server killed mid-write finds either
 * the old complete file or the new complete file, never a truncated one. Saves happen on quit and on
 * shutdown — which is exactly when a crash is most likely to catch one in flight.
 */
public final class FileStatisticsStorage implements StatisticsStorage {

    private final Path directory;

    public FileStatisticsStorage(Path directory) {
        this.directory = directory;
    }

    @Override
    public String describe() {
        return "local files (" + directory.getFileName() + ")";
    }

    @Override
    public PlayerStatistics load(UUID playerId) throws StorageException {
        Path file = directory.resolve(playerId + ".json");

        if (!Files.isRegularFile(file)) {
            // A player who has never recorded anything is not an error, and must not be reported as
            // one — the repository would then refuse to save them, and no new player could ever
            // record a statistic.
            return PlayerStatistics.empty();
        }

        try {
            String text = Files.readString(file, StandardCharsets.UTF_8);
            return StatisticsCodec.decode(JsonParser.parseString(text).getAsJsonObject());
        } catch (IOException unreadable) {
            throw new StorageException("Could not read " + file.getFileName(), unreadable);
        } catch (JsonSyntaxException | IllegalStateException corrupt) {
            // Reported as a failure rather than swallowed as "no data". The repository then refuses
            // to overwrite it, preserving the file for an operator to inspect instead of replacing a
            // recoverable record with an empty one on the next save.
            throw new StorageException("Statistics file " + file.getFileName()
                    + " is corrupt and was not overwritten", corrupt);
        }
    }

    @Override
    public void save(UUID playerId, PlayerStatistics statistics) throws StorageException {
        try {
            Files.createDirectories(directory);
            writeAtomically(directory.resolve(playerId + ".json"),
                    StatisticsCodec.encode(statistics).toString());
        } catch (IOException failed) {
            throw new StorageException("Could not save statistics for " + playerId, failed);
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
}
