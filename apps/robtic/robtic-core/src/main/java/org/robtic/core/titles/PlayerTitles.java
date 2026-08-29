package org.robtic.core.titles;

import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;

/**
 * What one player owns and what they are wearing.
 *
 * <h2>Unlimited owned, exactly one equipped</h2>
 *
 * Ownership is a set, so granting a title twice is harmless — which matters because grants arrive
 * from several directions (a job level-up, an admin command, a queued write replayed after an
 * outage) and none of them can see the others. The equipped title is a single optional id, and it
 * is only ever an id: the {@link Title} it names may stop existing across a config reload, and
 * storing the object would keep a deleted title alive in memory and on a player's head.
 *
 * <h2>Immutable</h2>
 *
 * Every change returns a new instance. This is read on the tick by placeholders and GUIs while it is
 * written by API callbacks, and copy-on-write means neither needs a lock — a reader either sees the
 * old value or the new one, never a set mid-insertion.
 *
 * <h2>Ownership lives here, never in LuckPerms</h2>
 *
 * LuckPerms is told what to display and nothing else. Storing ownership as permission nodes would
 * make the permissions plugin the authority on progression, which is both the wrong place for it and
 * impossible to query for an offline player's full collection without loading every user.
 *
 * @param owned    ids of every title this player has unlocked, in the order they unlocked them
 * @param equipped the id currently worn, or empty
 */
public record PlayerTitles(Set<String> owned, Optional<String> equipped) {

    /** A player with nothing yet. Also what a failed load degrades to, so callers never see null. */
    public static final PlayerTitles EMPTY = new PlayerTitles(Set.of(), Optional.empty());

    public PlayerTitles {
        // Insertion-ordered so "recently unlocked" is answerable without a timestamp per title.
        owned = java.util.Collections.unmodifiableSet(new LinkedHashSet<>(owned));
    }

    public boolean owns(String id) {
        return owned.contains(id);
    }

    /** @return this instance unchanged when the title is already owned, so callers can compare by identity */
    public PlayerTitles withOwned(String id) {
        if (owned.contains(id)) {
            return this;
        }

        Set<String> next = new LinkedHashSet<>(owned);
        next.add(id);

        return new PlayerTitles(next, equipped);
    }

    /**
     * Removes a title, taking it off the player's head if they were wearing it.
     *
     * Both halves together on purpose. Resigning from a job removes its titles, and a version that
     * only cleared ownership would leave the player wearing a title they no longer own — visible to
     * everyone, and not removable through the GUI because the GUI only lists what is owned.
     */
    public PlayerTitles withoutOwned(String id) {
        if (!owned.contains(id)) {
            return this;
        }

        Set<String> next = new LinkedHashSet<>(owned);
        next.remove(id);

        return new PlayerTitles(next, equipped.filter(current -> !current.equals(id)));
    }

    /** Wears a title. The caller has already checked ownership and unlock conditions. */
    public PlayerTitles equipping(String id) {
        return new PlayerTitles(owned, Optional.of(id));
    }

    public PlayerTitles unequipped() {
        return new PlayerTitles(owned, Optional.empty());
    }

    public boolean wearing(String id) {
        return equipped.filter(id::equals).isPresent();
    }
}
