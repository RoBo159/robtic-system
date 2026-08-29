package org.robtic.core.titles;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.unlock.Attributes;
import org.robtic.core.unlock.UnlockContext;
import org.robtic.core.titles.events.PlayerSelectTitleEvent;
import org.robtic.core.titles.events.PlayerUnlockTitleEvent;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Owning, wearing and losing titles.
 *
 * <h2>The one place ownership changes</h2>
 *
 * Jobs, admin commands, the GUI and any future system all come through here. That is what makes the
 * rules — you cannot wear what you do not own, you cannot own the same title twice, unlocking fires
 * exactly once — hold regardless of who is asking, rather than being re-implemented per caller with
 * slightly different gaps.
 *
 * <h2>What this class does not know</h2>
 *
 * It has no idea jobs exist. {@link #unlock} takes a title id and a free-text reason; whether that
 * reason is a job milestone, a dungeon clear or an admin's command is not its business. See
 * {@link Title} for why that direction is load-bearing.
 */
public final class TitleService {

    /** Why a title could not be equipped, so callers can say something specific. */
    public enum Refusal {
        /** No title with that id is configured. */
        UNKNOWN_TITLE,
        /** The player does not own it. */
        NOT_OWNED,
        /** Its unlock conditions are not currently met. */
        LOCKED,
        /** It carries a permission the player lacks. */
        NO_PERMISSION,
        /** Their progression could not be loaded, so nothing may be written for them. */
        NOT_LOADED
    }

    private final Plugin plugin;
    private final TitleCatalog catalog;
    private final TitleStore store;
    private final Attributes attributes;

    /** Swapped at runtime by the hook, so a LuckPerms reload does not need this service rebuilt. */
    private volatile TitleDisplay display = TitleDisplay.NONE;

    public TitleService(
            Plugin plugin,
            TitleCatalog catalog,
            TitleStore store,
            Attributes attributes
    ) {
        this.plugin = plugin;
        this.catalog = catalog;
        this.store = store;
        this.attributes = attributes;
    }

    public TitleCatalog catalog() {
        return catalog;
    }

    public void displayWith(TitleDisplay display) {
        this.display = display == null ? TitleDisplay.NONE : display;
    }

    public TitleDisplay display() {
        return display;
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    public PlayerTitles titlesOf(UUID playerId) {
        return store.titles(playerId);
    }

    /**
     * The titles a player owns that still exist in the configuration, sorted for display.
     *
     * A title deleted from {@code titles.yml} stays in the player's stored ownership and simply
     * stops appearing. It is not scrubbed, because a config edit is frequently a mistake or a
     * temporary removal, and deleting player data to match it is not reversible.
     */
    public List<Title> ownedTitles(UUID playerId) {
        PlayerTitles owned = titlesOf(playerId);

        return catalog.sorted().stream()
                .filter(title -> owned.owns(title.id()))
                .toList();
    }

    /**
     * Titles a player does not own, minus hidden ones.
     *
     * Hidden titles never appear until owned — that is what makes a secret or seasonal title secret.
     */
    public List<Title> lockedTitles(UUID playerId) {
        PlayerTitles owned = titlesOf(playerId);

        return catalog.sorted().stream()
                .filter(title -> !owned.owns(title.id()))
                .filter(title -> !title.hidden())
                .toList();
    }

    /** The equipped title, or empty when nothing is worn or the worn one no longer exists. */
    public Optional<Title> equipped(UUID playerId) {
        return titlesOf(playerId).equipped().flatMap(catalog::title);
    }

    /** Whether the unlock conditions of a title currently hold for a player. */
    public boolean conditionsMet(UUID playerId, Title title) {
        UnlockContext context = UnlockContext.of(
                playerId,
                Optional.ofNullable(plugin.getServer().getPlayer(playerId)),
                attributes);

        return title.unlock().satisfied(context);
    }

    /**
     * Why this player may not equip this title, or empty if they may.
     *
     * Returned rather than thrown, and as a reason rather than a boolean, so the GUI can render the
     * specific blocker on the locked entry instead of a generic "you can't".
     */
    public Optional<Refusal> refusalFor(UUID playerId, Title title) {
        if (!store.isLoaded(playerId)) {
            return Optional.of(Refusal.NOT_LOADED);
        }

        if (!titlesOf(playerId).owns(title.id())) {
            return Optional.of(Refusal.NOT_OWNED);
        }

        Player player = plugin.getServer().getPlayer(playerId);

        if (player != null && title.deniedByPermission(player)) {
            return Optional.of(Refusal.NO_PERMISSION);
        }

        // Conditions are re-checked at equip time, not only at unlock time. A title whose
        // requirement was later raised, or which depends on something revocable like a permission or
        // a season, should stop being wearable — owning it is not the same as still qualifying.
        return conditionsMet(playerId, title) ? Optional.empty() : Optional.of(Refusal.LOCKED);
    }

    // ─── Writing ──────────────────────────────────────────────────────────────────────────────

    /**
     * Grants ownership of a title.
     *
     * Idempotent: granting a title the player already owns does nothing, fires no event and writes
     * nothing. That matters because grants are re-attempted routinely — every level-up re-checks all
     * of a job's milestones so that a missed one is repaired rather than lost forever.
     *
     * @param reason free-text cause carried on the event, e.g. {@code job:miner:level:10}
     * @return whether the player now newly owns it
     */
    public boolean unlock(UUID playerId, String titleId, String reason) {
        Optional<Title> found = catalog.title(titleId);

        if (found.isEmpty()) {
            plugin.getLogger().warning("Something tried to grant the unknown title \"" + titleId
                    + "\" (" + reason + "). Check that titles.yml defines it.");
            return false;
        }

        Title title = found.get();

        if (!store.isLoaded(playerId)) {
            return false;
        }

        if (titlesOf(playerId).owns(title.id())) {
            return false;
        }

        PlayerUnlockTitleEvent event = new PlayerUnlockTitleEvent(playerId, title, reason);
        plugin.getServer().getPluginManager().callEvent(event);

        if (event.isCancelled()) {
            return false;
        }

        store.mutate(playerId, titles -> titles.withOwned(title.id()));

        return true;
    }

    /**
     * Removes ownership, taking the title off if it was being worn.
     *
     * Used by resignation. The display is refreshed unconditionally afterwards, because the player
     * may have been wearing it and there is no cheaper way to be sure than to reapply what they are
     * wearing now — which may be nothing.
     */
    public boolean revoke(UUID playerId, String titleId) {
        if (!store.isLoaded(playerId) || !titlesOf(playerId).owns(titleId)) {
            return false;
        }

        boolean wasWorn = titlesOf(playerId).wearing(titleId);

        store.mutate(playerId, titles -> titles.withoutOwned(titleId));

        if (wasWorn) {
            applyDisplay(playerId);
        }

        return true;
    }

    /**
     * Wears a title.
     *
     * @return empty on success, or why it was refused
     */
    public Optional<Refusal> equip(UUID playerId, String titleId) {
        Optional<Title> found = catalog.title(titleId);

        if (found.isEmpty()) {
            return Optional.of(Refusal.UNKNOWN_TITLE);
        }

        Title title = found.get();
        Optional<Refusal> refusal = refusalFor(playerId, title);

        if (refusal.isPresent()) {
            return refusal;
        }

        Optional<Title> previous = equipped(playerId);

        PlayerSelectTitleEvent event =
                new PlayerSelectTitleEvent(playerId, Optional.of(title), previous);
        plugin.getServer().getPluginManager().callEvent(event);

        if (event.isCancelled()) {
            return Optional.of(Refusal.LOCKED);
        }

        store.mutate(playerId, titles -> titles.equipping(title.id()));

        applyDisplay(playerId);

        return Optional.empty();
    }

    /** Takes off whatever is worn. A no-op when nothing is. */
    public boolean unequip(UUID playerId) {
        if (!store.isLoaded(playerId) || titlesOf(playerId).equipped().isEmpty()) {
            return false;
        }

        PlayerSelectTitleEvent event =
                new PlayerSelectTitleEvent(playerId, Optional.empty(), equipped(playerId));
        plugin.getServer().getPluginManager().callEvent(event);

        if (event.isCancelled()) {
            return false;
        }

        store.mutate(playerId, titles -> titles.unequipped());

        applyDisplay(playerId);

        return true;
    }

    /**
     * Pushes the player's current title to the display hook.
     *
     * Called on join and after every change. Also the repair path: if a permissions plugin was
     * restarted, or a prefix was edited by hand, the next login puts it back to what this system
     * says it should be — this service is the authority, and the display is a projection of it.
     */
    public void applyDisplay(UUID playerId) {
        try {
            display.apply(playerId, equipped(playerId));
        } catch (RuntimeException failure) {
            // A display failure must never propagate: the selection has already been saved and the
            // player already told. Losing the prefix is cosmetic; throwing here would abort whatever
            // called us, which could be a job level-up mid-grant.
            plugin.getLogger().warning("Could not apply the title display for " + playerId
                    + ": " + failure.getMessage());
        }
    }

    /**
     * The best title a player owns but is not wearing, for a "you have new titles" nudge.
     *
     * "Best" is priority then rarity — the same order the GUI sorts by, taken from the catalog so
     * the two cannot disagree about which title is the impressive one.
     */
    public Optional<Title> bestUnworn(UUID playerId) {
        PlayerTitles owned = titlesOf(playerId);

        return ownedTitles(playerId).stream()
                .filter(title -> !owned.wearing(title.id()))
                .max(Comparator
                        .comparingInt(Title::priority)
                        .thenComparingInt(title -> title.rarity().order()));
    }
}
