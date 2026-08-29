package org.robtic.jobs.workspace;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.gui.MenuItems;
import org.robtic.jobs.gui.ProgressionHolder;
import org.robtic.core.util.Chat;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The workspace's own screens: its panel, its storage and its upgrade page.
 *
 * <h2>Storage is a list, not an inventory</h2>
 *
 * The virtual storage holds counts rather than stacks, so it is rendered as one icon per material
 * with the quantity in the lore, and paged. Rendering it as a real inventory would mean converting
 * counts to stacks on open and back on close, which is where item duplication bugs come from — two
 * players with the same storage open, or a close that fails to fire.
 *
 * Withdrawals therefore happen by clicking an entry rather than by dragging, which is also what lets
 * the click be validated against ownership every time.
 */
public final class WorkspaceMenu {

    private static final int SIZE = 54;
    private static final int STORAGE_PER_PAGE = 45;

    private final WorkspaceService workspaces;
    private final WorkspaceTaxService tax;
    private final MessageCatalog messages;

    public WorkspaceMenu(WorkspaceService workspaces, WorkspaceTaxService tax, MessageCatalog messages) {
        this.workspaces = workspaces;
        this.tax = tax;
        this.messages = messages;
    }

    public void open(Player player, Workspace workspace) {
        player.openInventory(buildPanel(player, workspace));
    }

    // ─── Panel ────────────────────────────────────────────────────────────────────────────────

    /** The workspace's front page: what it is, what it holds, what it costs, what it could become. */
    public Inventory buildPanel(Player player, Workspace workspace) {
        BaseLevel tier = workspaces.baseOf(workspace);

        ProgressionHolder holder =
                new ProgressionHolder(ProgressionHolder.View.WORKSPACE, workspace.id());

        Inventory inventory = Bukkit.createInventory(holder, 27,
                Chat.component(messages.text("progression.gui.workspace.title",
                        "tier", tier.display())));

        holder.attach(inventory);

        for (int slot = 0; slot < 27; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        inventory.setItem(4, summary(workspace, tier));

        inventory.setItem(11, MenuItems.of(Material.CHEST,
                messages.text("progression.gui.workspace.storage"),
                List.of(
                        messages.text("progression.gui.workspace.storage-used",
                                "used", MenuItems.number(workspace.storage().used()),
                                "capacity", MenuItems.number(workspaces.capacityOf(workspace))),
                        messages.text("progression.gui.workspace.storage-hint"))));
        holder.bind(11, new ProgressionHolder.Action.OpenStorage(workspace.id(), 0));

        inventory.setItem(13, upgradeItem(workspace, tier));
        holder.bind(13, new ProgressionHolder.Action.OpenUpgrade(workspace.id()));

        inventory.setItem(15, taxItem(workspace));

        // Not bound when tax is switched off. The controller refuses the action anyway, but a button
        // that silently does nothing reads as broken; an unbound one reads as information.
        if (workspaces.settings().taxEnabled()) {
            holder.bind(15, new ProgressionHolder.Action.PayTax(workspace.id()));
        }

        inventory.setItem(22, MenuItems.back(messages.text("progression.gui.back")));
        holder.bind(22, new ProgressionHolder.Action.Back(ProgressionHolder.View.JOBS));

        return inventory;
    }

    private org.bukkit.inventory.ItemStack summary(Workspace workspace, BaseLevel tier) {
        List<String> lore = new ArrayList<>();

        lore.add(messages.text("progression.gui.workspace.profession",
                "profession", workspace.professionId()));
        lore.add(messages.text("progression.gui.workspace.level",
                "level", String.valueOf(workspace.level()),
                "max", String.valueOf(workspaces.settings().maxBaseLevel())));
        lore.add(messages.text("progression.gui.workspace.where",
                "where", workspace.region().describe()));
        lore.add("");

        if (workspaces.suspended(workspace)) {
            // First and unmissable: everything else on this screen is secondary to the fact that the
            // business is not currently working. Both causes read the same to a player — they cannot
            // trade — so they share a line rather than being spelled out separately here.
            lore.add(messages.text("progression.gui.workspace.suspended"));
            lore.add("");
        }

        // Whatever future systems want to say about this business. See WorkspaceExtension.
        workspaces.describeExtensions(workspace).forEach(line -> lore.add("&7" + line));

        if (!tier.unlocks().isEmpty()) {
            lore.add(messages.text("progression.gui.workspace.capabilities",
                    "list", String.join(", ", tier.unlocks())));
        }

        return MenuItems.glowing(Material.OAK_DOOR,
                messages.text("progression.gui.workspace.name", "tier", tier.display()), lore);
    }

    private org.bukkit.inventory.ItemStack upgradeItem(Workspace workspace, BaseLevel current) {
        Optional<BaseLevel> next = workspaces.settings().nextBase(workspace.level());

        if (next.isEmpty()) {
            return MenuItems.of(Material.NETHER_STAR,
                    messages.text("progression.gui.workspace.max-tier"),
                    List.of(messages.text("progression.gui.workspace.max-tier-hint")));
        }

        BaseLevel target = next.get();
        List<String> lore = new ArrayList<>();

        lore.add(messages.text("progression.gui.workspace.upgrade-cost",
                "cost", MenuItems.robs(target.cost())));
        lore.add("");

        // What actually changes, not just the target. A player deciding whether to spend needs the
        // comparison — storage no longer moves with a base level, so what is worth showing here is
        // the headcount and the systems the level opens up.
        if (target.totalWorkers() > current.totalWorkers()) {
            lore.add(messages.text("progression.gui.workspace.upgrade-workers",
                    "from", MenuItems.number(current.totalWorkers()),
                    "to", MenuItems.number(target.totalWorkers())));
        }

        target.npcRoles().stream()
                .filter(role -> !current.staffs(role))
                .forEach(role -> lore.add(messages.text("progression.gui.workspace.upgrade-npc",
                        "npc", role)));

        target.unlocks().stream()
                .filter(unlock -> !current.unlocks(unlock))
                .forEach(unlock -> lore.add(messages.text("progression.gui.workspace.upgrade-feature",
                        "feature", unlock)));

        lore.add("");
        lore.add(messages.text("progression.gui.workspace.upgrade-safe"));

        return MenuItems.of(Material.ANVIL,
                messages.text("progression.gui.workspace.upgrade", "tier", target.display()), lore);
    }

    private org.bukkit.inventory.ItemStack taxItem(Workspace workspace) {
        if (!workspaces.settings().taxEnabled()) {
            return MenuItems.of(Material.GRAY_DYE,
                    messages.text("progression.gui.workspace.tax-disabled"));
        }

        long now = System.currentTimeMillis();
        List<String> lore = new ArrayList<>();

        lore.add(messages.text("progression.gui.workspace.tax-amount",
                "amount", MenuItems.robs(tax.amountFor(workspace))));

        if (tax.overdue(workspace, now)) {
            lore.add(messages.text("progression.gui.workspace.tax-overdue"));
        } else {
            lore.add(messages.text("progression.gui.workspace.tax-due",
                    "when", describe(tax.until(workspace, now))));
        }

        lore.add("");
        lore.add(messages.text("progression.gui.workspace.tax-hint"));

        return MenuItems.of(
                workspace.taxSuspended() ? Material.REDSTONE_BLOCK : Material.GOLD_INGOT,
                messages.text("progression.gui.workspace.tax"), lore);
    }

    /** A duration as "3d 4h" or "12m" — enough precision to act on, not enough to be noise. */
    private static String describe(Duration duration) {
        long days = duration.toDays();
        long hours = duration.toHoursPart();
        long minutes = duration.toMinutesPart();

        if (days > 0) {
            return days + "d " + hours + "h";
        }

        return hours > 0 ? hours + "h " + minutes + "m" : Math.max(1, minutes) + "m";
    }

    // ─── Storage ──────────────────────────────────────────────────────────────────────────────

    /**
     * The storage page.
     *
     * One icon per material, quantity in the lore. Clicking withdraws — a stack on a plain click, the
     * whole lot on shift-click, which is the convention players already expect from every other
     * storage GUI they use.
     */
    public Inventory buildStorage(Workspace workspace, int page) {
        List<WorkspaceStorage.Entry> entries = workspace.storage().entries();

        int pages = Math.max(1, (int) Math.ceil(entries.size() / (double) STORAGE_PER_PAGE));
        int current = Math.max(0, Math.min(page, pages - 1));

        ProgressionHolder holder =
                new ProgressionHolder(ProgressionHolder.View.WORKSPACE_STORAGE, workspace.id());

        Inventory inventory = Bukkit.createInventory(holder, SIZE,
                Chat.component(messages.text("progression.gui.workspace.storage-title",
                        "page", String.valueOf(current + 1),
                        "pages", String.valueOf(pages))));

        holder.attach(inventory);

        int from = current * STORAGE_PER_PAGE;
        int to = Math.min(entries.size(), from + STORAGE_PER_PAGE);

        for (int index = from; index < to; index++) {
            WorkspaceStorage.Entry entry = entries.get(index);
            int slot = index - from;

            inventory.setItem(slot, MenuItems.of(entry.material(),
                    "&f" + pretty(entry.material()),
                    List.of(
                            messages.text("progression.gui.workspace.stored",
                                    "amount", MenuItems.number(entry.amount())),
                            "",
                            messages.text("progression.gui.workspace.withdraw-hint"))));

            holder.bind(slot, new ProgressionHolder.Action.Withdraw(
                    workspace.id(), entry.material().name(), current));
        }

        for (int slot = 45; slot < SIZE; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        if (entries.isEmpty()) {
            inventory.setItem(22, MenuItems.of(Material.BARRIER,
                    messages.text("progression.gui.workspace.storage-empty"),
                    List.of(messages.text("progression.gui.workspace.storage-empty-hint"))));
        }

        inventory.setItem(48, MenuItems.page(messages.text("progression.gui.previous"), current > 0));

        if (current > 0) {
            holder.bind(48, new ProgressionHolder.Action.OpenStorage(workspace.id(), current - 1));
        }

        inventory.setItem(49, MenuItems.of(Material.HOPPER,
                messages.text("progression.gui.workspace.deposit"),
                List.of(
                        messages.text("progression.gui.workspace.deposit-hint"),
                        messages.text("progression.gui.workspace.storage-used",
                                "used", MenuItems.number(workspace.storage().used()),
                                "capacity", MenuItems.number(workspaces.capacityOf(workspace))))));
        holder.bind(49, new ProgressionHolder.Action.DepositAll(workspace.id(), current));

        inventory.setItem(50, MenuItems.page(messages.text("progression.gui.next"), current + 1 < pages));

        if (current + 1 < pages) {
            holder.bind(50, new ProgressionHolder.Action.OpenStorage(workspace.id(), current + 1));
        }

        inventory.setItem(53, MenuItems.back(messages.text("progression.gui.back")));
        holder.bind(53, new ProgressionHolder.Action.OpenWorkspace(workspace.id()));

        return inventory;
    }

    // ─── Upgrade ──────────────────────────────────────────────────────────────────────────────

    /**
     * The upgrade confirmation page.
     *
     * A separate screen rather than a click on the panel, because this spends money and the panel is
     * a page players open casually. The whole ladder is shown, not only the next rung: a player
     * deciding whether to spend now wants to see where it leads.
     */
    public Inventory buildUpgrade(Player player, Workspace workspace) {
        BaseLevel current = workspaces.baseOf(workspace);
        Optional<BaseLevel> next = workspaces.settings().nextBase(workspace.level());

        ProgressionHolder holder =
                new ProgressionHolder(ProgressionHolder.View.WORKSPACE_UPGRADE, workspace.id());

        Inventory inventory = Bukkit.createInventory(holder, 27,
                Chat.component(messages.text("progression.gui.workspace.upgrade-title")));

        holder.attach(inventory);

        for (int slot = 0; slot < 27; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        // The ladder across the top row, so the whole progression is legible at a glance.
        int slot = 0;

        for (BaseLevel tier : workspaces.settings().baseLevels()) {
            // The row holds nine. A ladder longer than that is legitimate — levels are unlimited by
            // design — so the overflow is dropped rather than the row being allowed to run into the
            // rest of the page. The confirmation item below always shows the next rung, which is the
            // one a player is actually deciding about.
            if (slot > 8) {
                break;
            }

            boolean reached = tier.level() <= workspace.level();

            inventory.setItem(slot, MenuItems.of(
                    reached ? Material.LIME_STAINED_GLASS_PANE : Material.GRAY_STAINED_GLASS_PANE,
                    (reached ? "&a" : "&8") + tier.display(),
                    List.of(
                            messages.text("progression.gui.workspace.tier-workers",
                                    "npc", MenuItems.number(tier.npcWorkers()),
                                    "player", MenuItems.number(tier.playerWorkers())),
                            messages.text(reached
                                    ? "progression.gui.workspace.tier-reached"
                                    : "progression.gui.workspace.tier-locked",
                                    "cost", MenuItems.robs(tier.cost())))));

            slot++;
        }

        if (next.isEmpty()) {
            inventory.setItem(13, MenuItems.glowing(Material.NETHER_STAR,
                    messages.text("progression.gui.workspace.max-tier"),
                    List.of(messages.text("progression.gui.workspace.max-tier-hint"))));
        } else {
            inventory.setItem(13, upgradeItem(workspace, current));
            holder.bind(13, new ProgressionHolder.Action.ConfirmUpgrade(workspace.id()));
        }

        inventory.setItem(22, MenuItems.back(messages.text("progression.gui.back")));
        holder.bind(22, new ProgressionHolder.Action.OpenWorkspace(workspace.id()));

        return inventory;
    }

    /** Renders {@code DIAMOND_ORE} as {@code Diamond Ore}. */
    private static String pretty(Material material) {
        String[] words = material.name().toLowerCase(java.util.Locale.ROOT).split("_");
        StringBuilder builder = new StringBuilder();

        for (String word : words) {
            if (!builder.isEmpty()) {
                builder.append(' ');
            }
            builder.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }

        return builder.toString();
    }
}
