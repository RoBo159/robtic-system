package org.robtic.minecraft.progression.gui;

import org.robtic.minecraft.progression.titles.Title;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * What each player has the title menu filtered and sorted to.
 *
 * <h2>Held per player, outside the inventory</h2>
 *
 * A Bukkit inventory is rebuilt from scratch on every redraw, so any state stored on it is lost the
 * moment a player changes page. Keeping it here means the filters survive paging, equipping,
 * searching and reopening the menu — which is what a player expects after setting a filter, and what
 * makes the search worth having at all.
 *
 * Entries are dropped when a player disconnects, so this cannot grow unbounded.
 *
 * @param search    free text matched against display name and description, empty for none
 * @param rarityId  restrict to one rarity, empty for all
 * @param sourceId  restrict to one source, empty for all
 * @param sort      the order titles are listed in
 * @param showLocked whether titles the player does not own are listed at all
 * @param page      zero-based page number
 */
public record TitleMenuState(
        String search,
        String rarityId,
        String sourceId,
        Sort sort,
        boolean showLocked,
        int page
) {

    /** How the list is ordered. */
    public enum Sort {
        /** Priority, then rarity, then name — the catalog's own order. */
        DEFAULT("Recommended"),
        /** Rarest first. */
        RARITY("Rarity"),
        /** A to Z. */
        NAME("Name"),
        /** Grouped by where they come from. */
        SOURCE("Source");

        private final String display;

        Sort(String display) {
            this.display = display;
        }

        public String display() {
            return display;
        }

        /** The next mode, so one button cycles through them all rather than needing four. */
        public Sort next() {
            Sort[] values = values();
            return values[(ordinal() + 1) % values.length];
        }
    }

    public static final TitleMenuState DEFAULT =
            new TitleMenuState("", "", "", Sort.DEFAULT, true, 0);

    /** Per-player state. */
    private static final Map<UUID, TitleMenuState> STATES = new ConcurrentHashMap<>();

    public static TitleMenuState of(UUID playerId) {
        return STATES.getOrDefault(playerId, DEFAULT);
    }

    public static void set(UUID playerId, TitleMenuState state) {
        STATES.put(playerId, state);
    }

    /** Drops a player's state. Called on quit. */
    public static void forget(UUID playerId) {
        STATES.remove(playerId);
    }

    public TitleMenuState withSearch(String value) {
        return new TitleMenuState(value == null ? "" : value.trim(), rarityId, sourceId, sort, showLocked, 0);
    }

    public TitleMenuState withRarity(String value) {
        return new TitleMenuState(search, value == null ? "" : value, sourceId, sort, showLocked, 0);
    }

    public TitleMenuState withSource(String value) {
        return new TitleMenuState(search, rarityId, value == null ? "" : value, sort, showLocked, 0);
    }

    public TitleMenuState withSort(Sort value) {
        return new TitleMenuState(search, rarityId, sourceId, value, showLocked, 0);
    }

    public TitleMenuState withShowLocked(boolean value) {
        return new TitleMenuState(search, rarityId, sourceId, sort, value, 0);
    }

    public TitleMenuState withPage(int value) {
        return new TitleMenuState(search, rarityId, sourceId, sort, showLocked, Math.max(0, value));
    }

    public TitleMenuState cleared() {
        return new TitleMenuState("", "", "", sort, showLocked, 0);
    }

    public boolean filtered() {
        return !search.isBlank() || !rarityId.isBlank() || !sourceId.isBlank();
    }

    /**
     * Applies this state to a list of titles.
     *
     * Every filter and the sort in one place, so the menu that draws the list and the counter that
     * reports "12 of 60" can never disagree about what is being shown.
     *
     * @param owned whether the player owns a given title, used by the locked filter
     */
    public List<Title> apply(List<Title> titles, java.util.function.Predicate<Title> owned) {
        String needle = search.toLowerCase(Locale.ROOT);

        List<Title> filtered = titles.stream()
                .filter(title -> showLocked || owned.test(title))
                .filter(title -> rarityId.isBlank() || title.rarity().id().equals(rarityId))
                .filter(title -> sourceId.isBlank() || title.source().id().equals(sourceId))
                .filter(title -> needle.isBlank() || matches(title, needle))
                .toList();

        Comparator<Title> comparator = switch (sort) {
            case RARITY -> Comparator.comparingInt((Title title) -> title.rarity().order()).reversed()
                    .thenComparing(Title::display, String.CASE_INSENSITIVE_ORDER);
            case NAME -> Comparator.comparing(Title::display, String.CASE_INSENSITIVE_ORDER);
            case SOURCE -> Comparator.comparing((Title title) -> title.source().display(),
                            String.CASE_INSENSITIVE_ORDER)
                    .thenComparing(Title::display, String.CASE_INSENSITIVE_ORDER);
            // The catalog already sorted by priority then rarity then name; preserve it.
            case DEFAULT -> null;
        };

        return comparator == null ? filtered : filtered.stream().sorted(comparator).toList();
    }

    /**
     * Whether a title matches a search term.
     *
     * Colour codes are stripped before matching, so searching for "stone" finds a title displayed as
     * {@code &7Stone&fbreaker} — which the raw string would not.
     */
    private static boolean matches(Title title, String needle) {
        if (title.display().replaceAll("[&§].", "").toLowerCase(Locale.ROOT).contains(needle)) {
            return true;
        }

        return title.description().stream()
                .map(line -> line.replaceAll("[&§].", "").toLowerCase(Locale.ROOT))
                .anyMatch(line -> line.contains(needle));
    }

    /** A short description of the active filters, for the menu's header. */
    public Optional<String> describeFilters() {
        if (!filtered()) {
            return Optional.empty();
        }

        StringBuilder builder = new StringBuilder();

        if (!search.isBlank()) {
            builder.append("\"").append(search).append("\"");
        }

        if (!rarityId.isBlank()) {
            append(builder, rarityId);
        }

        if (!sourceId.isBlank()) {
            append(builder, sourceId);
        }

        return Optional.of(builder.toString());
    }

    private static void append(StringBuilder builder, String value) {
        if (!builder.isEmpty()) {
            builder.append(", ");
        }
        builder.append(value);
    }
}
