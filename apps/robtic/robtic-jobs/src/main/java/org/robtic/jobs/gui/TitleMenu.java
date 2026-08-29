package org.robtic.jobs.gui;

import org.robtic.core.gui.MenuItems;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.registry.Rarity;
import org.robtic.core.titles.TitleSource;
import org.robtic.core.titles.PlayerTitles;
import org.robtic.core.titles.Title;
import org.robtic.core.titles.TitleService;
import org.robtic.core.util.Chat;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The titles menu: browse, filter, search, preview and equip.
 *
 * <pre>
 *   rows 1–4   the titles themselves, 36 per page
 *   row 5      filler
 *   row 6      sort · rarity filter · source filter · search · clear · unequip · pages
 * </pre>
 *
 * <h2>Locked titles are shown, not hidden</h2>
 *
 * A locked title renders in grey with its requirement spelled out. That is the whole reason the menu
 * is worth opening for a new player: it is a list of things to go and do. Only titles flagged
 * {@code hidden} are withheld, which is what makes those ones a surprise.
 *
 * <h2>Rebuilt on every interaction</h2>
 *
 * There is no incremental update path. Filters, pages and equipping all redraw the whole inventory,
 * because the alternative — patching individual slots — has to know what every control looked like
 * before, and gets it wrong the first time a filter changes how many pages there are.
 */
public final class TitleMenu {

    private static final int SIZE = 54;
    private static final int PER_PAGE = 36;

    // Control row.
    private static final int SLOT_SORT = 45;
    private static final int SLOT_RARITY = 46;
    private static final int SLOT_SOURCE = 47;
    private static final int SLOT_SEARCH = 48;
    private static final int SLOT_CLEAR = 49;
    private static final int SLOT_LOCKED = 50;
    private static final int SLOT_UNEQUIP = 51;
    private static final int SLOT_PREVIOUS = 52;
    private static final int SLOT_NEXT = 53;

    private final TitleService titles;
    private final MessageCatalog messages;

    public TitleMenu(TitleService titles, MessageCatalog messages) {
        this.titles = titles;
        this.messages = messages;
    }

    public void open(Player player) {
        player.openInventory(build(player));
    }

    /** Builds the inventory for the player's current filter state. */
    public Inventory build(Player player) {
        UUID playerId = player.getUniqueId();
        TitleMenuState state = TitleMenuState.of(playerId);
        PlayerTitles owned = titles.titlesOf(playerId);

        List<Title> visible = state.apply(
                titles.catalog().sorted().stream()
                        // Hidden titles appear only once owned — that is what makes them secret.
                        .filter(title -> !title.hidden() || owned.owns(title.id()))
                        .toList(),
                title -> owned.owns(title.id()));

        int pages = Math.max(1, (int) Math.ceil(visible.size() / (double) PER_PAGE));
        int page = Math.min(state.page(), pages - 1);

        ProgressionHolder holder = new ProgressionHolder(ProgressionHolder.View.TITLES, null);

        Inventory inventory = org.bukkit.Bukkit.createInventory(holder, SIZE,
                Chat.component(messages.text("progression.gui.titles.title",
                        "page", String.valueOf(page + 1),
                        "pages", String.valueOf(pages))));

        holder.attach(inventory);

        drawTitles(inventory, holder, visible, page, playerId, owned);
        drawControls(inventory, holder, state, page, pages, visible.size(), playerId);

        return inventory;
    }

    private void drawTitles(
            Inventory inventory,
            ProgressionHolder holder,
            List<Title> visible,
            int page,
            UUID playerId,
            PlayerTitles owned
    ) {
        int from = page * PER_PAGE;
        int to = Math.min(visible.size(), from + PER_PAGE);

        for (int index = from; index < to; index++) {
            Title title = visible.get(index);
            int slot = index - from;

            boolean isOwned = owned.owns(title.id());
            boolean isWorn = owned.wearing(title.id());

            inventory.setItem(slot, icon(title, isOwned, isWorn, playerId));

            holder.bind(slot, isOwned && titles.refusalFor(playerId, title).isEmpty()
                    ? new ProgressionHolder.Action.EquipTitle(title.id())
                    : new ProgressionHolder.Action.LockedTitle(title.id()));
        }
    }

    /**
     * One title's icon.
     *
     * The material changes with ownership rather than only the colour, because a menu where the only
     * difference between owned and locked is a shade of grey is hard to read at a glance — and this
     * is a screen players scan rather than study.
     */
    private org.bukkit.inventory.ItemStack icon(Title title, boolean owned, boolean worn, UUID playerId) {
        Rarity rarity = title.rarity();
        String colour = MenuItems.legacy(title.color());

        List<String> lore = new ArrayList<>();

        lore.add("&8" + rarity.display() + " · " + title.source().display());
        lore.add("");

        title.description().forEach(line -> lore.add("&7" + line));

        if (!title.description().isEmpty()) {
            lore.add("");
        }

        if (worn) {
            lore.add(messages.text("progression.gui.titles.worn"));
        } else if (owned) {
            Optional<TitleService.Refusal> refusal = titles.refusalFor(playerId, title);

            if (refusal.isEmpty()) {
                lore.add(messages.text("progression.gui.titles.click-to-equip"));
            } else {
                lore.add(messages.text("progression.gui.titles.owned-but-locked",
                        "reason", describe(refusal.get(), title)));
            }
        } else {
            // The requirement, spelled out. A locked title that does not say what it needs is just
            // a tease; this is the line that turns the menu into a to-do list.
            lore.add(messages.text("progression.gui.titles.locked",
                    "requirement", title.unlock().describe()));
            lore.add(messages.text("progression.gui.titles.from-source",
                    "source", title.source().display()));
        }

        Material material = owned ? title.icon() : Material.GRAY_DYE;
        String name = (owned ? colour : "&8") + MenuItems.plain(title.display());

        return worn || (owned && rarity.glow())
                ? MenuItems.glowing(material, name, lore)
                : MenuItems.of(material, name, lore);
    }

    private String describe(TitleService.Refusal refusal, Title title) {
        return switch (refusal) {
            case NOT_OWNED -> messages.text("progression.gui.titles.refusal.not-owned");
            case LOCKED -> title.unlock().describe();
            case NO_PERMISSION -> messages.text("progression.gui.titles.refusal.no-permission");
            case NOT_LOADED -> messages.text("progression.gui.titles.refusal.not-loaded");
            case UNKNOWN_TITLE -> messages.text("progression.gui.titles.refusal.unknown");
        };
    }

    private void drawControls(
            Inventory inventory,
            ProgressionHolder holder,
            TitleMenuState state,
            int page,
            int pages,
            int matches,
            UUID playerId
    ) {
        for (int slot = 36; slot < SIZE; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        inventory.setItem(SLOT_SORT, MenuItems.of(Material.COMPARATOR,
                messages.text("progression.gui.titles.sort", "sort", state.sort().display()),
                List.of(messages.text("progression.gui.titles.sort-hint"))));
        holder.bind(SLOT_SORT, new ProgressionHolder.Action.Sort(state.sort().next()));

        inventory.setItem(SLOT_RARITY, MenuItems.of(Material.AMETHYST_SHARD,
                messages.text("progression.gui.titles.filter-rarity",
                        "value", state.rarityId().isBlank()
                                ? messages.text("progression.gui.titles.filter-all")
                                : titles.catalog().rarity(state.rarityId()).display())));
        holder.bind(SLOT_RARITY, new ProgressionHolder.Action.Back(
                ProgressionHolder.View.FILTER_RARITY));

        inventory.setItem(SLOT_SOURCE, MenuItems.of(Material.BOOK,
                messages.text("progression.gui.titles.filter-source",
                        "value", state.sourceId().isBlank()
                                ? messages.text("progression.gui.titles.filter-all")
                                : titles.catalog().source(state.sourceId()).display())));
        holder.bind(SLOT_SOURCE, new ProgressionHolder.Action.Back(
                ProgressionHolder.View.FILTER_SOURCE));

        inventory.setItem(SLOT_SEARCH, MenuItems.of(Material.OAK_SIGN,
                messages.text("progression.gui.titles.search",
                        "value", state.search().isBlank()
                                ? messages.text("progression.gui.titles.search-none")
                                : state.search())));
        holder.bind(SLOT_SEARCH, new ProgressionHolder.Action.Search());

        // The counter goes on the clear button, where a player looking at "12 of 60" is already
        // wondering how to get back to 60.
        inventory.setItem(SLOT_CLEAR, MenuItems.of(
                state.filtered() ? Material.BARRIER : Material.STRUCTURE_VOID,
                messages.text("progression.gui.titles.clear"),
                List.of(messages.text("progression.gui.titles.showing",
                        "shown", String.valueOf(matches),
                        "total", String.valueOf(titles.catalog().titles().size())))));
        holder.bind(SLOT_CLEAR, new ProgressionHolder.Action.ClearFilters());

        inventory.setItem(SLOT_LOCKED, MenuItems.of(
                state.showLocked() ? Material.ENDER_EYE : Material.ENDER_PEARL,
                messages.text(state.showLocked()
                        ? "progression.gui.titles.hiding-none"
                        : "progression.gui.titles.owned-only")));
        holder.bind(SLOT_LOCKED, new ProgressionHolder.Action.ToggleLocked(!state.showLocked()));

        Optional<Title> worn = titles.equipped(playerId);

        inventory.setItem(SLOT_UNEQUIP, MenuItems.of(Material.BARRIER,
                messages.text("progression.gui.titles.unequip"),
                worn.map(title -> List.of(messages.text("progression.gui.titles.currently",
                                "title", MenuItems.legacy(title.color()) + MenuItems.plain(title.display()))))
                        .orElse(List.of())));
        holder.bind(SLOT_UNEQUIP, new ProgressionHolder.Action.Unequip());

        inventory.setItem(SLOT_PREVIOUS, MenuItems.page(
                messages.text("progression.gui.previous"), page > 0));

        if (page > 0) {
            holder.bind(SLOT_PREVIOUS, new ProgressionHolder.Action.Page(page - 1));
        }

        inventory.setItem(SLOT_NEXT, MenuItems.page(
                messages.text("progression.gui.next"), page + 1 < pages));

        if (page + 1 < pages) {
            holder.bind(SLOT_NEXT, new ProgressionHolder.Action.Page(page + 1));
        }
    }

    // ─── Filter sub-menus ─────────────────────────────────────────────────────────────────────

    /** The rarity picker. Small, so one row plus a clear button. */
    public Inventory buildRarityFilter(Player player) {
        List<Rarity> rarities = new ArrayList<>(titles.catalog().rarities().all());
        rarities.sort(java.util.Comparator.comparingInt(Rarity::order));

        return buildFilter(
                ProgressionHolder.View.FILTER_RARITY,
                messages.text("progression.gui.titles.filter-rarity-title"),
                rarities.size(),
                (inventory, holder) -> {
                    for (int index = 0; index < rarities.size(); index++) {
                        Rarity rarity = rarities.get(index);

                        inventory.setItem(index, MenuItems.of(Material.AMETHYST_SHARD,
                                MenuItems.legacy(rarity.color()) + rarity.display()));

                        holder.bind(index, new ProgressionHolder.Action.FilterRarity(rarity.id()));
                    }
                });
    }

    /** The source picker. */
    public Inventory buildSourceFilter(Player player) {
        List<TitleSource> sources = new ArrayList<>(titles.catalog().sources().all());

        return buildFilter(
                ProgressionHolder.View.FILTER_SOURCE,
                messages.text("progression.gui.titles.filter-source-title"),
                sources.size(),
                (inventory, holder) -> {
                    for (int index = 0; index < sources.size(); index++) {
                        TitleSource source = sources.get(index);

                        inventory.setItem(index, MenuItems.of(source.icon(), "&f" + source.display(),
                                source.description().isBlank()
                                        ? List.of()
                                        : List.of("&7" + source.description())));

                        holder.bind(index, new ProgressionHolder.Action.FilterSource(source.id()));
                    }
                });
    }

    /**
     * Shared frame for the two filter pickers.
     *
     * Sized to the number of entries rather than fixed, so a server with four rarities gets a
     * one-row menu instead of five rows of empty glass.
     */
    private Inventory buildFilter(
            ProgressionHolder.View view,
            String titleText,
            int entries,
            java.util.function.BiConsumer<Inventory, ProgressionHolder> fill
    ) {
        int rows = Math.max(2, (int) Math.ceil((entries + 1) / 9.0d) + 1);
        int size = Math.min(54, rows * 9);

        ProgressionHolder holder = new ProgressionHolder(view, null);
        Inventory inventory = org.bukkit.Bukkit.createInventory(holder, size, Chat.component(titleText));
        holder.attach(inventory);

        fill.accept(inventory, holder);

        int clearSlot = size - 9;
        int backSlot = size - 1;

        inventory.setItem(clearSlot, MenuItems.of(Material.STRUCTURE_VOID,
                messages.text("progression.gui.titles.filter-all")));

        holder.bind(clearSlot, view == ProgressionHolder.View.FILTER_RARITY
                ? new ProgressionHolder.Action.FilterRarity("")
                : new ProgressionHolder.Action.FilterSource(""));

        inventory.setItem(backSlot, MenuItems.back(messages.text("progression.gui.back")));
        holder.bind(backSlot, new ProgressionHolder.Action.Back(ProgressionHolder.View.TITLES));

        return inventory;
    }
}
