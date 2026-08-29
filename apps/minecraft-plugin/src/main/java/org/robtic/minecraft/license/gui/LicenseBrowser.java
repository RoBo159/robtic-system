package org.robtic.minecraft.license.gui;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.license.LicenseService;
import org.robtic.minecraft.license.api.License;
import org.robtic.minecraft.license.api.LicenseCategory;
import org.robtic.minecraft.license.api.LicenseHolding;
import org.robtic.minecraft.license.config.LicenseSettings;
import org.robtic.minecraft.license.item.LicenseItemFactory;
import org.robtic.minecraft.util.Chat;
import org.robtic.minecraft.util.Robs;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * The licence browser: every registered licence, owned or not.
 *
 * <h2>Locked licences stay visible</h2>
 *
 * A licence a player does not have is shown greyed rather than hidden, with how to obtain it in the
 * lore. A browser that only listed what you already own would answer a question nobody has; the
 * interesting one is what exists and how to get it.
 *
 * <h2>Nothing here is written in code</h2>
 *
 * Every string on every item comes from {@code messages.yml}, and every licence's name, description,
 * acquisition text and requirements come from its own definition. A server changes the wording
 * without a build, and a licence registered by a future plugin appears here with no change at all.
 */
public final class LicenseBrowser {

    /** Entries per page. The last row is reserved for navigation. */
    private static final int PER_PAGE_ROW = 9;

    private final LicenseService licenses;
    private final MessageCatalog messages;

    private volatile LicenseSettings settings;

    public LicenseBrowser(LicenseService licenses, MessageCatalog messages, LicenseSettings settings) {
        this.licenses = licenses;
        this.messages = messages;
        this.settings = settings;
    }

    public void settings(LicenseSettings replacement) {
        this.settings = replacement;
    }

    /** Opens the browser at its first page, unfiltered. */
    public void open(Player player) {
        open(player, "", 0);
    }

    public void open(Player player, String categoryId, int page) {
        player.openInventory(build(player, categoryId, page));

        settings.openSound().ifPresent(sound ->
                player.playSound(player.getLocation(), sound, 0.7f, 1.2f));
    }

    /**
     * Builds the browser.
     *
     * @param categoryId the category to show, or empty for all of them
     */
    public Inventory build(Player player, String categoryId, int page) {
        List<License> shown = categoryId == null || categoryId.isBlank()
                ? licenses.all()
                : licenses.registry().byCategory(categoryId);

        int rows = settings.browserRows();
        int perPage = (rows - 2) * PER_PAGE_ROW;

        int pages = Math.max(1, (int) Math.ceil(shown.size() / (double) perPage));
        int current = Math.max(0, Math.min(page, pages - 1));

        LicenseBrowserHolder holder = new LicenseBrowserHolder(categoryId, current);

        Inventory inventory = Bukkit.createInventory(holder, rows * PER_PAGE_ROW,
                Chat.component(messages.text("license.gui.title",
                        "page", String.valueOf(current + 1),
                        "pages", String.valueOf(pages))));

        holder.attach(inventory);

        Map<String, LicenseHolding> held = licenses.heldBy(player);
        long now = System.currentTimeMillis();

        int from = current * perPage;
        int to = Math.min(shown.size(), from + perPage);

        for (int index = from; index < to; index++) {
            License license = shown.get(index);
            int slot = index - from;

            inventory.setItem(slot, entry(license, held.get(license.id()), now));

            LicenseHolding holding = held.get(license.id());

            // Renewal is bound only where it could actually do something. A button that explains why
            // it is disabled is better than one that spends a click to say "you do not own this".
            if (holding != null && license.canRenew() && !license.permanent()) {
                holder.bind(slot, new LicenseBrowserHolder.Action.Renew(license.id()));
            } else {
                holder.bind(slot, new LicenseBrowserHolder.Action.Inspect(license.id()));
            }
        }

        decorate(inventory, holder, rows, categoryId, current, pages);

        return inventory;
    }

    /**
     * One licence's entry.
     *
     * The material is the licence's own icon, so a resource pack that gives licences custom models
     * shows them here as well as in the hand — see {@link LicenseItemFactory}, which is the only
     * other place an icon is resolved.
     */
    private ItemStack entry(License license, LicenseHolding holding, long now) {
        Material icon = holding == null
                ? Material.GRAY_DYE
                : Optional.ofNullable(Material.matchMaterial(license.icon().toUpperCase(Locale.ROOT)))
                        .orElse(Material.PAPER);

        List<String> lore = new ArrayList<>();

        license.description().forEach(lore::add);

        if (!license.description().isEmpty()) {
            lore.add("");
        }

        lore.add(messages.text("license.gui.category",
                "category", licenses.registry().category(license.categoryId()).display()));
        lore.add(messages.text("license.gui.rarity", "rarity", license.rarity()));
        lore.add("");

        // ─── Status ───────────────────────────────────────────────────────────────────────────

        if (holding == null) {
            lore.add(messages.text("license.gui.status-locked"));
        } else if (holding.expired(now)) {
            lore.add(messages.text("license.gui.status-expired",
                    "when", LicenseItemFactory.date(holding.expiresAt())));
        } else if (holding.permanent()) {
            lore.add(messages.text("license.gui.status-permanent"));
        } else {
            lore.add(messages.text("license.gui.status-valid",
                    "remaining", LicenseItemFactory.describe(holding.remaining(now)),
                    "when", LicenseItemFactory.date(holding.expiresAt())));
        }

        // ─── Renewal ──────────────────────────────────────────────────────────────────────────

        if (!license.permanent() && license.canRenew()) {
            lore.add("");
            lore.add(messages.text("license.gui.renewal-cost",
                    "cost", Robs.format(license.renewalCost())));
            lore.add(messages.text("license.gui.renewal-period",
                    "period", LicenseItemFactory.describe(license.renewalPeriod())));

            if (holding != null) {
                lore.add(messages.text("license.gui.renew-hint"));
            }
        }

        // ─── How to obtain, and what it needs ─────────────────────────────────────────────────
        //
        // Only shown for a licence the player does not hold: somebody already carrying one does not
        // need telling where to find it, and the space is better spent on its status.

        if (holding == null && !license.acquisition().isEmpty()) {
            lore.add("");
            lore.add(messages.text("license.gui.how-to-obtain"));
            license.acquisition().forEach(line -> lore.add(messages.text("license.gui.bullet",
                    "text", line)));
        }

        if (!license.requirements().isEmpty()) {
            lore.add("");
            lore.add(messages.text("license.gui.requirements"));
            license.requirements().forEach(line -> lore.add(messages.text("license.gui.bullet",
                    "text", line)));
        }

        ItemStack stack = new ItemStack(icon, 1);
        ItemMeta meta = stack.getItemMeta();

        if (meta != null) {
            meta.displayName(Chat.component(license.display()).decoration(
                    net.kyori.adventure.text.format.TextDecoration.ITALIC, false));

            List<net.kyori.adventure.text.Component> rendered = new ArrayList<>();

            for (String line : lore) {
                rendered.add(Chat.component(line).decoration(
                        net.kyori.adventure.text.format.TextDecoration.ITALIC, false));
            }

            meta.lore(rendered);

            if (license.modelData() > 0 && holding != null) {
                meta.setCustomModelData(license.modelData());
            }

            meta.addItemFlags(org.bukkit.inventory.ItemFlag.HIDE_ATTRIBUTES,
                    org.bukkit.inventory.ItemFlag.HIDE_ADDITIONAL_TOOLTIP);

            stack.setItemMeta(meta);
        }

        return stack;
    }

    /** The bottom two rows: category tabs and paging. */
    private void decorate(
            Inventory inventory,
            LicenseBrowserHolder holder,
            int rows,
            String categoryId,
            int page,
            int pages
    ) {
        int tabRow = (rows - 2) * PER_PAGE_ROW;
        int navRow = (rows - 1) * PER_PAGE_ROW;

        for (int slot = tabRow; slot < rows * PER_PAGE_ROW; slot++) {
            inventory.setItem(slot, filler());
        }

        // ─── Category tabs ────────────────────────────────────────────────────────────────────

        inventory.setItem(tabRow, tab(Material.BOOKSHELF,
                messages.text("license.gui.all-categories"),
                categoryId == null || categoryId.isBlank()));

        holder.bind(tabRow, new LicenseBrowserHolder.Action.Filter(""));

        int slot = tabRow + 1;

        for (LicenseCategory category : licenses.registry().categories()) {
            if (slot >= navRow) {
                // More categories than the row can hold. The rest are still reachable through the
                // "all" tab, which is a better failure than silently dropping the last few.
                break;
            }

            Material icon = Optional.ofNullable(
                            Material.matchMaterial(category.icon().toUpperCase(Locale.ROOT)))
                    .orElse(Material.BOOK);

            inventory.setItem(slot, tab(icon, category.display(),
                    category.id().equals(categoryId)));

            holder.bind(slot, new LicenseBrowserHolder.Action.Filter(category.id()));
            slot++;
        }

        // ─── Paging ───────────────────────────────────────────────────────────────────────────

        if (page > 0) {
            inventory.setItem(navRow, nav(Material.ARROW, messages.text("license.gui.previous")));
            holder.bind(navRow, new LicenseBrowserHolder.Action.Page(page - 1));
        }

        inventory.setItem(navRow + 4, nav(Material.BARRIER, messages.text("license.gui.close")));
        holder.bind(navRow + 4, new LicenseBrowserHolder.Action.Close());

        if (page + 1 < pages) {
            inventory.setItem(navRow + 8, nav(Material.ARROW, messages.text("license.gui.next")));
            holder.bind(navRow + 8, new LicenseBrowserHolder.Action.Page(page + 1));
        }
    }

    private ItemStack tab(Material material, String name, boolean selected) {
        ItemStack stack = new ItemStack(selected ? Material.LIME_STAINED_GLASS_PANE : material, 1);
        return named(stack, (selected ? "&a» " : "&7") + name);
    }

    private ItemStack nav(Material material, String name) {
        return named(new ItemStack(material, 1), name);
    }

    private ItemStack filler() {
        return named(new ItemStack(Material.GRAY_STAINED_GLASS_PANE, 1), " ");
    }

    private ItemStack named(ItemStack stack, String name) {
        ItemMeta meta = stack.getItemMeta();

        if (meta != null) {
            meta.displayName(Chat.component(name).decoration(
                    net.kyori.adventure.text.format.TextDecoration.ITALIC, false));

            meta.addItemFlags(org.bukkit.inventory.ItemFlag.HIDE_ATTRIBUTES);
            stack.setItemMeta(meta);
        }

        return stack;
    }
}
