package org.robtic.minecraft.progression.titles;

import java.util.Optional;
import java.util.UUID;

/**
 * Shows a player's equipped title wherever the server renders names.
 *
 * <h2>An interface so the title system never imports LuckPerms</h2>
 *
 * The only implementation is the LuckPerms hook, and it is the only class in the progression system
 * that mentions LuckPerms at all — the same isolation {@code LuckPermsGroupApplier} already uses
 * elsewhere in this plugin, and for the same reason: the JVM does not resolve those types on a
 * server that has not installed it, so nothing here fails to load.
 *
 * <h2>Display only</h2>
 *
 * Implementations write a prefix or suffix and nothing else. They are never asked which titles a
 * player owns, and must never store ownership: that lives in {@link PlayerTitles} and is written to
 * Robtic's own storage. A permissions plugin holding progression state would be a second authority
 * on it, queryable only for loaded users, and impossible to reconcile after an outage.
 */
public interface TitleDisplay {

    /** Nothing is installed to render titles. Every call is a no-op; the system runs unchanged. */
    TitleDisplay NONE = new TitleDisplay() {
        @Override
        public void apply(UUID playerId, Optional<Title> title) {
        }

        @Override
        public boolean available() {
            return false;
        }
    };

    /**
     * Makes the player's rendered name reflect this title, removing whatever was there before.
     *
     * @param title the title to show, or empty to clear
     *
     * <p>Called on the main thread. An implementation that has to touch storage must do that
     * asynchronously itself — the caller has already told the player the change happened, because a
     * title selection that appeared to hang until a permissions write completed would feel broken.
     *
     * <p>Must never throw. The permissions plugin being unavailable is a display failure, and a
     * display failure must not roll back a selection the player has already been told about, nor
     * propagate out of the service and abort the storage write.
     */
    void apply(UUID playerId, Optional<Title> title);

    /** Whether anything is actually rendering titles, so commands can warn instead of lying. */
    default boolean available() {
        return true;
    }
}
