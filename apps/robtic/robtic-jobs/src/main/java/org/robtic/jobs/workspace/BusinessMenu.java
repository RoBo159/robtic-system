package org.robtic.jobs.workspace;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.gui.MenuItems;
import org.robtic.core.util.Chat;
import org.robtic.core.util.Durations;
import org.robtic.jobs.gui.ProgressionHolder;
import org.robtic.jobs.workspace.worker.NpcWorker;
import org.robtic.jobs.workspace.worker.PlayerWorker;
import org.robtic.jobs.workspace.worker.WorkerService;
import org.robtic.jobs.workspace.worker.WorkerYieldService;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The two screens the business system added: its upgrade catalogue and its workforce.
 *
 * <h2>Separate from {@code WorkspaceMenu}, deliberately</h2>
 *
 * That class draws the panel, the storage and the base-level ladder — everything a workspace had
 * before it was a business. These are the two new axes, and keeping them here means the older
 * screens did not have to grow a second set of responsibilities to accommodate them.
 *
 * <h2>Every entry explains itself, including the ones that cannot be clicked</h2>
 *
 * A locked upgrade says which base level it wants. An unhireable slot says whether the problem is
 * the level, the licence or the money. That is the whole reason these are drawn rather than simply
 * omitted: a menu that hides what a player cannot have yet gives them nothing to work towards, and
 * one that greys it out without saying why reads as broken.
 */
public final class BusinessMenu {

    private static final int SIZE = 54;

    private final WorkspaceService workspaces;
    private final WorkerService workers;
    private final WorkerYieldService yields;
    private final MessageCatalog messages;

    public BusinessMenu(
            WorkspaceService workspaces,
            WorkerService workers,
            WorkerYieldService yields,
            MessageCatalog messages
    ) {
        this.workspaces = workspaces;
        this.workers = workers;
        this.yields = yields;
        this.messages = messages;
    }

    // ─── Upgrade catalogue ────────────────────────────────────────────────────────────────────

    /**
     * Everything the business can buy, and what state each of them is in.
     *
     * Upgrades an unlock has not granted are omitted entirely rather than shown locked — they are
     * not part of this business's world yet, and listing a tax office to somebody four levels below
     * one is noise. Steps that are merely unaffordable or gated on a base level ARE shown, because
     * those are things to work towards.
     */
    public Inventory buildUpgrades(Player player, Workspace workspace) {
        BaseLevel base = workspaces.baseOf(workspace);

        ProgressionHolder holder =
                new ProgressionHolder(ProgressionHolder.View.WORKSPACE_UPGRADES, workspace.id());

        Inventory inventory = Bukkit.createInventory(holder, SIZE,
                Chat.component(messages.text("progression.gui.workspace.upgrades-title")));

        holder.attach(inventory);

        for (int slot = 0; slot < SIZE; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        int slot = 10;

        for (WorkspaceUpgrade upgrade : workspaces.settings().upgrades()) {
            if (!upgrade.availableAt(base)) {
                continue;
            }

            if (slot >= 44) {
                break;
            }

            inventory.setItem(slot, upgradeItem(workspace, base, upgrade));

            // Bound only when it is actually buyable. An unbound entry reads as information; a bound
            // one that refuses reads as a broken button.
            if (nextBuyable(workspace, upgrade).isPresent()) {
                holder.bind(slot, new ProgressionHolder.Action.BuyUpgrade(
                        workspace.id(), upgrade.id()));
            }

            slot += (slot % 9 == 7) ? 3 : 1;
        }

        inventory.setItem(49, MenuItems.back(messages.text("progression.gui.back")));
        holder.bind(49, new ProgressionHolder.Action.OpenWorkspace(workspace.id()));

        return inventory;
    }

    private ItemStack upgradeItem(Workspace workspace, BaseLevel base, WorkspaceUpgrade upgrade) {
        int current = workspace.upgradeLevel(upgrade.id());
        List<String> lore = new ArrayList<>(upgrade.description());

        lore.add("");
        lore.add(messages.text("progression.gui.workspace.upgrade-level",
                "level", String.valueOf(current),
                "max", String.valueOf(upgrade.maxLevel())));

        Optional<WorkspaceUpgrade.Step> next = upgrade.next(current);

        if (next.isEmpty()) {
            lore.add("");
            lore.add(messages.text("progression.gui.workspace.upgrade-maxed"));

            return MenuItems.glowing(upgrade.icon(), upgrade.display(), lore);
        }

        WorkspaceUpgrade.Step step = next.get();

        lore.add("");
        lore.add(messages.text("progression.gui.workspace.upgrade-next",
                "level", String.valueOf(step.level()),
                "cost", MenuItems.robs(step.cost())));

        // Every reason it cannot be bought, not just the first. A player who fixes the base level
        // and then discovers a dependency they were never told about has been sent round twice.
        boolean buyable = true;

        if (workspace.level() < step.minBaseLevel()) {
            lore.add(messages.text("progression.gui.workspace.upgrade-needs-base",
                    "level", String.valueOf(step.minBaseLevel())));
            buyable = false;
        }

        for (var dependency : step.requires().entrySet()) {
            if (workspace.upgradeLevel(dependency.getKey()) < dependency.getValue()) {
                lore.add(messages.text("progression.gui.workspace.upgrade-needs-other",
                        "upgrade", dependency.getKey(),
                        "level", String.valueOf(dependency.getValue())));
                buyable = false;
            }
        }

        if (workspaces.suspended(workspace)) {
            lore.add(messages.text("progression.gui.workspace.suspended"));
            buyable = false;
        }

        return buyable
                ? MenuItems.glowing(upgrade.icon(), upgrade.display(), lore)
                : MenuItems.of(Material.GRAY_DYE, "&8" + MenuItems.plain(upgrade.display()), lore);
    }

    /** The step that could be bought right now, or empty when something is in the way. */
    private Optional<WorkspaceUpgrade.Step> nextBuyable(Workspace workspace, WorkspaceUpgrade upgrade) {
        if (workspaces.suspended(workspace)) {
            return Optional.empty();
        }

        return upgrade.next(workspace.upgradeLevel(upgrade.id()))
                .filter(step -> workspace.level() >= step.minBaseLevel())
                .filter(step -> step.requires().entrySet().stream().allMatch(dependency ->
                        workspace.upgradeLevel(dependency.getKey()) >= dependency.getValue()));
    }

    // ─── Workforce ────────────────────────────────────────────────────────────────────────────

    /**
     * Who works here, and what it would take to employ somebody else.
     *
     * The top row is the summary — headcount against the limit, and why the workforce is idle if it
     * is. Below it, one entry per employee, then the empty slots the base level permits.
     *
     * An empty slot is drawn rather than omitted for the same reason a locked upgrade is: it is the
     * thing a player is working towards, and a page that showed only what they already have would
     * never tell them the next base level buys them another pair of hands.
     */
    public Inventory buildWorkers(Player player, Workspace workspace) {
        ProgressionHolder holder =
                new ProgressionHolder(ProgressionHolder.View.WORKSPACE_WORKERS, workspace.id());

        Inventory inventory = Bukkit.createInventory(holder, SIZE,
                Chat.component(messages.text("progression.gui.workspace.workers-title")));

        holder.attach(inventory);

        for (int slot = 0; slot < SIZE; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        inventory.setItem(4, summary(workspace));

        int slot = 18;

        for (NpcWorker worker : workspace.npcWorkers()) {
            if (slot >= 44) {
                break;
            }

            inventory.setItem(slot, npcWorkerItem(worker));
            holder.bind(slot, new ProgressionHolder.Action.DismissWorker(
                    workspace.id(), worker.id()));
            slot++;
        }

        for (PlayerWorker worker : workspace.playerWorkers()) {
            if (slot >= 44) {
                break;
            }

            inventory.setItem(slot, playerWorkerItem(worker));
            holder.bind(slot, new ProgressionHolder.Action.DismissWorker(
                    workspace.id(), worker.id()));
            slot++;
        }

        // The empty NPC slots. Clicking one hires for the business's own profession, which is the
        // only trade it can employ today — see the HireWorker action on why it is still carried.
        int free = workers.npcFreeSlots(workspace);

        for (int spare = 0; spare < free && slot < 44; spare++, slot++) {
            inventory.setItem(slot, emptySlot(workspace));

            if (!workspaces.suspended(workspace)) {
                holder.bind(slot, new ProgressionHolder.Action.HireWorker(
                        workspace.id(), workspace.professionId()));
            }
        }

        inventory.setItem(49, MenuItems.back(messages.text("progression.gui.back")));
        holder.bind(49, new ProgressionHolder.Action.OpenWorkspace(workspace.id()));

        return inventory;
    }

    private ItemStack summary(Workspace workspace) {
        int hired = workspace.npcWorkers().size() + workspace.playerWorkers().size();
        int limit = workspaces.baseOf(workspace).totalWorkers();

        List<String> lore = new ArrayList<>();

        lore.add(messages.text("progression.gui.workspace.workers-count",
                "hired", String.valueOf(hired),
                "limit", String.valueOf(limit)));
        lore.add(messages.text("progression.gui.workspace.workers-breakdown",
                "npc", String.valueOf(workspace.npcWorkers().size()),
                "player", String.valueOf(workspace.playerWorkers().size())));

        if (!workers.unlocked(workspace)) {
            lore.add("");
            lore.add(messages.text("progression.gui.workspace.workers-locked"));

            return MenuItems.of(Material.IRON_BARS,
                    messages.text("progression.gui.workspace.workers"), lore);
        }

        // Why nobody is producing, when nobody is. Without this an owner watches storage stop
        // filling and has no way to find out which of three unrelated causes it was.
        Set<String> idle = yields.idleReasons(workspace);

        if (!idle.isEmpty()) {
            lore.add("");

            if (idle.contains("suspended")) {
                lore.add(messages.text("progression.gui.workspace.workers-idle-suspended"));
            }

            if (idle.contains("maintenance")) {
                lore.add(messages.text("progression.gui.workspace.workers-idle-maintenance"));
            }
        }

        lore.add("");
        lore.add(messages.text("progression.gui.workspace.workers-hint"));

        return MenuItems.glowing(Material.CARTOGRAPHY_TABLE,
                messages.text("progression.gui.workspace.workers"), lore);
    }

    private ItemStack npcWorkerItem(NpcWorker worker) {
        long now = System.currentTimeMillis();
        List<String> lore = new ArrayList<>();

        lore.add(messages.text("progression.gui.workspace.worker-profession",
                "profession", worker.professionId()));
        lore.add(messages.text("progression.gui.workspace.worker-salary",
                "salary", MenuItems.robs(worker.salary())));
        lore.add(messages.text("progression.gui.workspace.worker-hired",
                "when", Durations.format(now - worker.hiredAt())));

        if (worker.maintenanceOverdue(now)) {
            lore.add("");
            lore.add(messages.text("progression.gui.workspace.worker-maintenance-due"));
        }

        lore.add("");
        lore.add(messages.text("progression.gui.workspace.worker-dismiss"));

        return MenuItems.of(Material.VILLAGER_SPAWN_EGG,
                messages.text("progression.gui.workspace.worker-npc",
                        "profession", worker.professionId()), lore);
    }

    private ItemStack playerWorkerItem(PlayerWorker worker) {
        String name = Optional.ofNullable(
                Bukkit.getOfflinePlayer(worker.player()).getName()).orElse("Unknown");

        List<String> lore = new ArrayList<>();

        lore.add(messages.text("progression.gui.workspace.worker-salary",
                "salary", MenuItems.robs(worker.salary())));
        lore.add(messages.text("progression.gui.workspace.worker-permissions",
                "list", worker.permissions().isEmpty()
                        ? "none"
                        : String.join(", ", worker.permissions())));

        if (!worker.task().isBlank()) {
            lore.add(messages.text("progression.gui.workspace.worker-task", "task", worker.task()));
        }

        lore.add("");
        lore.add(messages.text("progression.gui.workspace.worker-dismiss"));

        return MenuItems.of(Material.PLAYER_HEAD,
                messages.text("progression.gui.workspace.worker-player", "player", name), lore);
    }

    private ItemStack emptySlot(Workspace workspace) {
        List<String> lore = new ArrayList<>();

        lore.add(messages.text("progression.gui.workspace.worker-empty-hint",
                "cost", MenuItems.robs(workers.settings().npcHireCost()),
                "profession", workspace.professionId()));
        lore.add("");

        // Stated up front rather than discovered on refusal. The Manager Licence is expensive and
        // easy to let lapse, and finding out at the moment of hiring is the worst time.
        lore.add(messages.text("progression.gui.workspace.worker-empty-licence"));

        return MenuItems.of(Material.LIGHT_GRAY_DYE,
                messages.text("progression.gui.workspace.worker-empty"), lore);
    }
}
