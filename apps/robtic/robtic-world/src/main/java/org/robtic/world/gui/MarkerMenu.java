package org.robtic.world.gui;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.robtic.core.gui.MenuItems;
import org.robtic.world.api.MarkerCategory;
import org.robtic.world.api.MarkerRegistry;
import org.robtic.world.api.MarkerType;
import org.robtic.world.config.MarkerSettings;
import org.robtic.core.util.Chat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;

/**
 * The menu {@code /workspace marker edit} opens: every marker the server knows about, one click to
 * get one.
 *
 * <h2>Built from the registry, every time it opens</h2>
 *
 * There is no layout file and no fixed slot list. A module that registers three new marker types at
 * enable gets three new entries here with no edit to this class, which is the requirement that
 * everything about this system be extensible through the registry rather than through code.
 *
 * <h2>The entry and the item are different objects</h2>
 *
 * What a builder sees in the menu uses the marker type's own icon, so twelve marker types are twelve
 * distinguishable entries. What they receive is the marker <em>block</em> — a sign, by default —
 * because that is the thing that can actually be placed and can actually carry the data. Showing the
 * placeable item in the menu would make every row look identical; handing over the icon would give
 * them something that cannot be placed at all.
 */
public final class MarkerMenu {

    private final MarkerRegistry registry;
    private final Supplier<MarkerSettings> settings;
    private final org.robtic.world.item.MarkerItemFactory items;

    /** The category tab meaning "no filter". Not a registered category, so it cannot collide with one. */
    public static final String ALL = "*";

    public MarkerMenu(
            MarkerRegistry registry,
            org.robtic.world.item.MarkerItemFactory items,
            Supplier<MarkerSettings> settings
    ) {
        this.registry = registry;
        this.items = items;
        this.settings = settings;
    }

    /** Opens the menu at a category and page. */
    public void open(Player player, String categoryId, int page) {
        MarkerSettings config = settings.get();

        int rows = config.menuRows();
        int contentSlots = (rows - 2) * 9;

        List<MarkerType> types = categoryId.equals(ALL)
                ? registry.all()
                : registry.byCategory(categoryId);

        int pages = Math.max(1, (int) Math.ceil(types.size() / (double) contentSlots));
        int current = Math.max(0, Math.min(page, pages - 1));

        MarkerMenuHolder holder = new MarkerMenuHolder(categoryId, current);

        Inventory inventory = Bukkit.createInventory(holder, rows * 9,
                Chat.component(config.menuTitle()));

        holder.inventory(inventory);

        fillContent(inventory, holder, types, current, contentSlots);
        fillPaging(inventory, holder, rows, current, pages, types.size());
        fillTabs(inventory, holder, rows, categoryId);

        player.openInventory(inventory);
    }

    private void fillContent(
            Inventory inventory,
            MarkerMenuHolder holder,
            List<MarkerType> types,
            int page,
            int contentSlots
    ) {
        int from = page * contentSlots;

        for (int slot = 0; slot < contentSlots; slot++) {
            int index = from + slot;

            if (index >= types.size()) {
                break;
            }

            MarkerType type = types.get(index);

            inventory.setItem(slot, entry(type));
            holder.offer(slot, type.id());
        }
    }

    /**
     * One menu entry, describing what the marker is and the rules attached to it.
     *
     * The cardinality and level are shown because they are the two things a builder gets wrong: they
     * place two of something that allows one, or they place a level 3 slot and wonder why no NPC
     * appears in a level 1 building. Both are answered here, before the mistake.
     */
    private ItemStack entry(MarkerType type) {
        List<String> lore = new ArrayList<>(type.description());

        if (!lore.isEmpty()) {
            lore.add("");
        }

        lore.add("&8Type &7" + type.id());
        lore.add("&8Group &7" + registry.category(type.categoryId()).display());

        lore.add("&8Allowed &7" + switch (type.cardinality()) {
            case EXACTLY_ONE -> "exactly one";
            case AT_MOST_ONE -> "at most one";
            case ANY -> "any number";
        } + (type.required() ? " &c(required)" : ""));

        if (type.level() > 0) {
            lore.add("&8Unlocks at &7building level " + type.level());
        }

        if (type.spawnsNpc()) {
            lore.add("&8NPC role &7" + type.npcRole());
        }

        if (type.bounds().corner()) {
            lore.add("&8Defines the &7" + type.bounds().name().toLowerCase(Locale.ROOT) + " corner");
        }

        if (!type.metadataKeys().isEmpty()) {
            lore.add("&8Metadata &7" + String.join(", ", type.metadataKeys()));
        }

        lore.add("");
        lore.add("&eClick &7for one.");

        ItemStack entry = MenuItems.of(icon(type.icon()), type.display(), lore);

        if (type.modelData() > 0) {
            var meta = entry.getItemMeta();

            if (meta != null) {
                meta.setCustomModelData(type.modelData());
                entry.setItemMeta(meta);
            }
        }

        return entry;
    }

    private void fillPaging(
            Inventory inventory,
            MarkerMenuHolder holder,
            int rows,
            int page,
            int pages,
            int total
    ) {
        int row = (rows - 2) * 9;

        for (int slot = row; slot < row + 9; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        inventory.setItem(row + 3, MenuItems.page("&ePrevious page", page > 0));
        inventory.setItem(row + 5, MenuItems.page("&eNext page", page < pages - 1));

        inventory.setItem(row + 4, MenuItems.of(Material.BOOK, "&6Markers", List.of(
                "&7Page &f" + (page + 1) + "&7/&f" + pages,
                "&7Showing &f" + total + "&7 marker type(s).",
                "",
                "&8Place a marker where you want",
                "&8something to happen, then save",
                "&8the schematic with BetterStructures.")));
    }

    /** Slot of the previous-page button, for the listener. */
    public static int previousSlot(int rows) {
        return (rows - 2) * 9 + 3;
    }

    /** Slot of the next-page button, for the listener. */
    public static int nextSlot(int rows) {
        return (rows - 2) * 9 + 5;
    }

    /**
     * Category tabs along the bottom.
     *
     * Only categories that types actually use are shown. A declared-but-empty category would be a
     * tab that opens onto nothing, which reads as a bug every time somebody clicks it.
     */
    private void fillTabs(Inventory inventory, MarkerMenuHolder holder, int rows, String selected) {
        int row = (rows - 1) * 9;

        for (int slot = row; slot < row + 9; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        List<MarkerCategory> shown = new ArrayList<>();

        for (MarkerCategory category : registry.categories()) {
            if (!registry.byCategory(category.id()).isEmpty()) {
                shown.add(category);
            }
        }

        int slot = row;

        inventory.setItem(slot, tab(Material.CHEST, "&fAll markers",
                registry.size() + " type(s)", selected.equals(ALL)));
        holder.tab(slot, ALL);
        slot++;

        for (MarkerCategory category : shown) {
            if (slot >= row + 9) {
                // More categories than tabs. The overflow is reachable through "All", so nothing is
                // unusable — but it is worth a server knowing they have outgrown the bar.
                break;
            }

            inventory.setItem(slot, tab(icon(category.icon()), category.display(),
                    registry.byCategory(category.id()).size() + " type(s)",
                    selected.equals(category.id())));

            holder.tab(slot, category.id());
            slot++;
        }
    }

    private ItemStack tab(Material material, String name, String count, boolean selected) {
        List<String> lore = List.of("&7" + count, "", selected ? "&aShowing this group." : "&eClick to show.");

        return selected
                ? MenuItems.glowing(material, name, lore)
                : MenuItems.of(material, name, lore);
    }

    /** The item a click hands over: the placeable marker block, carrying this type's data. */
    public ItemStack itemFor(MarkerType type) {
        return items.create(type, settings.get().blockMaterial());
    }

    /**
     * Resolves an icon, falling back rather than failing.
     *
     * An icon naming a material a Minecraft update removed should produce a plain entry, not a menu
     * that throws halfway through building itself and leaves the builder staring at nothing.
     */
    private static Material icon(String name) {
        Material material = name == null
                ? null
                : Material.matchMaterial(name.trim().toUpperCase(Locale.ROOT));

        return material == null || material.isAir() ? Material.PAPER : material;
    }
}
