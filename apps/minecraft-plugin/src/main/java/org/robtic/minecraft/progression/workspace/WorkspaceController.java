package org.robtic.minecraft.progression.workspace;

import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.progression.gui.MenuItems;
import org.robtic.minecraft.progression.gui.ProgressionHolder;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * Carries out the workspace menu actions.
 *
 * <h2>Every action re-validates</h2>
 *
 * A menu is a snapshot taken when it was drawn. Between then and the click, the workspace may have
 * been released, suspended, upgraded by another session, or the player may have stopped owning it.
 * So each action here re-reads the workspace by id and re-checks ownership rather than trusting what
 * the screen said — which is also why every action record carries the id.
 *
 * <h2>Separate from the menu that draws it</h2>
 *
 * {@link WorkspaceMenu} renders and this decides. Keeping them apart is what lets a future system
 * add a screen without touching the logic, and lets the logic be exercised without an inventory.
 */
public final class WorkspaceController {

    /** How often an interaction is written through as a new access time. See {@link #with}. */
    private static final long ACCESS_WRITE_INTERVAL_MILLIS = 60_000L;

    private final Plugin plugin;
    private final WorkspaceService workspaces;
    private final WorkspaceTaxService tax;
    private final WorkspaceMenu menu;
    private final MessageCatalog messages;

    /**
     * Which item names a profession will accept into storage.
     *
     * Injected as a function of profession id, so this class never learns that jobs exist — the
     * filter is a job's price list, and the job system is what knows it.
     */
    private final Function<String, Set<String>> professionItems;

    public WorkspaceController(
            Plugin plugin,
            WorkspaceService workspaces,
            WorkspaceTaxService tax,
            WorkspaceMenu menu,
            MessageCatalog messages,
            Function<String, Set<String>> professionItems
    ) {
        this.plugin = plugin;
        this.workspaces = workspaces;
        this.tax = tax;
        this.menu = menu;
        this.messages = messages;
        this.professionItems = professionItems;
    }

    public WorkspaceMenu menu() {
        return menu;
    }

    /**
     * Handles one workspace action.
     *
     * @return whether the action was recognised, so the caller can fall through to its own handling
     */
    public boolean handle(Player player, ProgressionHolder.Action action, boolean shiftClick) {
        switch (action) {
            case ProgressionHolder.Action.OpenWorkspace open ->
                    with(player, open.workspaceId(), workspace -> menu.open(player, workspace));

            case ProgressionHolder.Action.OpenStorage open ->
                    with(player, open.workspaceId(), workspace ->
                            player.openInventory(menu.buildStorage(workspace, open.page())));

            case ProgressionHolder.Action.OpenUpgrade open ->
                    with(player, open.workspaceId(), workspace ->
                            player.openInventory(menu.buildUpgrade(player, workspace)));

            case ProgressionHolder.Action.ConfirmUpgrade confirm ->
                    with(player, confirm.workspaceId(), workspace -> upgrade(player, workspace));

            case ProgressionHolder.Action.PayTax pay ->
                    with(player, pay.workspaceId(), workspace -> payTax(player, workspace));

            case ProgressionHolder.Action.Withdraw withdraw ->
                    with(player, withdraw.workspaceId(), workspace ->
                            withdraw(player, workspace, withdraw.material(), shiftClick, withdraw.page()));

            case ProgressionHolder.Action.DepositAll deposit ->
                    with(player, deposit.workspaceId(), workspace ->
                            depositAll(player, workspace, deposit.page()));

            default -> {
                return false;
            }
        }

        return true;
    }

    /**
     * Resolves a workspace and checks the player may act on it.
     *
     * The single gate every action passes through, so ownership cannot be forgotten in one branch.
     */
    private void with(Player player, String workspaceId, java.util.function.Consumer<Workspace> action) {
        Optional<Workspace> workspace = workspaces.byId(workspaceId);

        if (workspace.isEmpty()) {
            // Released while the menu was open. Closing is the honest response — reopening a stale
            // screen would let the player keep clicking at something that no longer exists.
            player.closeInventory();
            player.sendMessage(messages.prefixed("progression.workspace.gone"));
            return;
        }

        if (!workspace.get().ownedBy(player.getUniqueId())
                && !player.hasPermission(WorkspaceService.BYPASS)) {
            player.closeInventory();
            player.sendMessage(messages.prefixed("progression.workspace.not-yours"));
            return;
        }

        long now = System.currentTimeMillis();
        Workspace current = workspace.get();

        // Every interaction counts as access, which is what the idle reporting reads — but it is only
        // written through occasionally. A player browsing their storage generates a click a second,
        // and persisting a timestamp on each one is a storage round trip per click; on the file
        // backend that is a full rewrite of the server's workspace index to record that somebody is
        // still looking at a menu. Nothing depends on the value being precise.
        if (now - current.lastAccessAt() >= ACCESS_WRITE_INTERVAL_MILLIS) {
            current = workspaces.repository()
                    .mutate(workspaceId, stored -> stored.touched(now))
                    .orElse(current);
        }

        // The lazy half of the tax system, and the half that was missing: the design is that a bill
        // is evaluated when somebody touches the workspace, with the background sweep left to catch
        // only the ones nobody visits. Without this, an overdue workspace stayed fully working for up
        // to an hour after its grace ran out, purely depending on when the sweep next came round.
        // Cheap — it returns immediately unless the workspace is actually overdue.
        try {
            tax.evaluate(current, now);
        } catch (RuntimeException failure) {
            plugin.getLogger().warning("Tax evaluation failed for workspace " + workspaceId
                    + ": " + failure.getMessage());
        }

        // Re-read once more: evaluating may have suspended it, and the action should act on that.
        action.accept(workspaces.byId(workspaceId).orElse(current));
    }

    // ─── Upgrading ────────────────────────────────────────────────────────────────────────────

    private void upgrade(Player player, Workspace workspace) {
        workspaces.upgrade(player, workspace, result -> {
            switch (result) {
                case SUCCESS -> {
                    // The tier is read off the upgraded record rather than computed as "the level
                    // before, plus one". Levels and tier numbers are the same thing only while the
                    // configured ladder has no gaps; with a gap, the arithmetic names a tier the
                    // workspace did not move to, and the player is congratulated on the wrong thing.
                    Optional<Workspace> updated = workspaces.byId(workspace.id());

                    player.sendMessage(messages.prefixed("progression.workspace.upgraded",
                            "tier", updated.map(workspaces::tierOf)
                                    .map(WorkspaceTier::display)
                                    .orElseGet(() -> workspaces.tierOf(workspace).display())));

                    player.playSound(player.getLocation(), Sound.BLOCK_ANVIL_USE, 0.8f, 1.2f);

                    // Reopened so the new tier is visible immediately, rather than the player having
                    // to reopen a screen that still shows the old one.
                    updated.ifPresent(current -> menu.open(player, current));
                }
                case NOT_OWNER -> player.sendMessage(messages.prefixed("progression.workspace.not-yours"));
                case MAX_LEVEL -> player.sendMessage(messages.prefixed("progression.workspace.max-tier"));
                case CANNOT_AFFORD -> {
                    player.sendMessage(messages.prefixed("progression.workspace.cannot-afford"));
                    player.playSound(player.getLocation(), Sound.BLOCK_NOTE_BLOCK_BASS, 0.6f, 0.8f);
                }
                case SUSPENDED -> player.sendMessage(messages.prefixed("progression.workspace.upgrade-suspended"));
                case VETOED -> player.sendMessage(messages.prefixed("progression.workspace.upgrade-vetoed"));
                case SAVE_FAILED -> player.sendMessage(messages.prefixed("progression.workspace.upgrade-failed"));
            }
        });
    }

    // ─── Tax ──────────────────────────────────────────────────────────────────────────────────

    private void payTax(Player player, Workspace workspace) {
        if (!workspaces.settings().taxEnabled()) {
            return;
        }

        long now = System.currentTimeMillis();

        if (!tax.overdue(workspace, now)) {
            player.sendMessage(messages.prefixed("progression.workspace.tax-not-due",
                    "when", String.valueOf(tax.until(workspace, now).toHours())));
            return;
        }

        tax.collect(workspace, paid -> {
            if (paid) {
                player.sendMessage(messages.prefixed("progression.workspace.tax-paid",
                        "amount", MenuItems.robs(tax.amountFor(workspace))));

                player.playSound(player.getLocation(), Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 0.8f, 1.2f);

                workspaces.byId(workspace.id()).ifPresent(updated -> menu.open(player, updated));
            } else {
                player.sendMessage(messages.prefixed("progression.workspace.tax-unpaid",
                        "amount", MenuItems.robs(tax.amountFor(workspace))));
            }
        });
    }

    // ─── Storage ──────────────────────────────────────────────────────────────────────────────

    /**
     * Takes items out.
     *
     * Items are given to the player first and only removed from storage for the amount that actually
     * fit. Doing it the other way round — deduct, then try to give — loses items when an inventory is
     * full, which is the one failure a storage system must not have.
     */
    private void withdraw(
            Player player, Workspace workspace, String materialName, boolean everything, int page) {
        Material material = Material.matchMaterial(materialName);

        if (material == null) {
            return;
        }

        int held = workspace.storage().amountOf(material);

        if (held <= 0) {
            return;
        }

        int wanted = everything ? held : Math.min(held, material.getMaxStackSize());
        int room = roomFor(player, material);
        int giving = Math.min(wanted, room);

        if (giving <= 0) {
            player.sendMessage(messages.prefixed("progression.workspace.inventory-full"));
            return;
        }

        // Deducted first, then handed over — but only the amount the inventory has been measured to
        // accept, so addItem cannot leave a remainder.
        int taken = workspaces.withdraw(workspace, material, giving);

        if (taken <= 0) {
            return;
        }

        int remaining = taken;

        while (remaining > 0) {
            int size = Math.min(remaining, material.getMaxStackSize());

            // addItem reports what would not fit. The room was measured a moment ago so this should
            // always be empty — but "should" is not good enough for the one path that has already
            // deducted the items. Anything left over is dropped at the player's feet, because the
            // only unacceptable outcome here is items that exist nowhere.
            player.getInventory().addItem(new ItemStack(material, size)).values()
                    .forEach(leftOver -> player.getWorld().dropItem(player.getLocation(), leftOver));

            remaining -= size;
        }

        player.playSound(player.getLocation(), Sound.ENTITY_ITEM_PICKUP, 0.6f, 1.4f);

        // buildStorage clamps a page that no longer exists, so emptying the last entry on the last
        // page lands on the new last page rather than on nothing.
        workspaces.byId(workspace.id())
                .ifPresent(updated -> player.openInventory(menu.buildStorage(updated, page)));
    }

    /** How many of a material the player's inventory can still take. */
    private int roomFor(Player player, Material material) {
        int max = material.getMaxStackSize();
        int room = 0;

        for (ItemStack stack : player.getInventory().getStorageContents()) {
            if (stack == null || stack.getType().isAir()) {
                room += max;
            } else if (stack.getType() == material) {
                room += Math.max(0, max - stack.getAmount());
            }
        }

        return room;
    }

    /**
     * Puts every storable item from the player's inventory in.
     *
     * Only what this profession accepts, and only up to capacity. Anything rejected stays in the
     * player's inventory rather than being dropped or deleted.
     */
    private void depositAll(Player player, Workspace workspace, int page) {
        Set<String> accepted = professionItems.apply(workspace.professionId());
        int capacity = workspaces.capacityOf(workspace);

        int deposited = 0;
        int rejected = 0;
        boolean full = false;

        // The running storage state, applied in memory across the whole inventory and committed
        // once. It used to be committed per stack, which meant one click could produce thirty-six
        // persistence round trips — and on the file backend, thirty-six full rewrites of the
        // server's workspace index. WorkspaceStorage is an immutable value, so accumulating here
        // costs nothing and the capacity is still consumed correctly as the loop runs.
        WorkspaceStorage running = workspace.storage();

        ItemStack[] contents = player.getInventory().getStorageContents();

        // What each slot should hold afterwards: -1 leaves it alone, 0 empties it, anything else is
        // the remainder that did not fit. Worked out in full before the inventory is touched, so the
        // storage commit below happens while the items still exist in both places. Deducting first
        // and storing second is the ordering that loses a player's inventory if anything in between
        // goes wrong.
        int[] afterwards = new int[contents.length];
        java.util.Arrays.fill(afterwards, -1);

        for (int slot = 0; slot < contents.length; slot++) {
            ItemStack stack = contents[slot];

            if (stack == null || stack.getType().isAir()) {
                continue;
            }

            if (!workspaces.storable(workspace, stack.getType(), accepted)) {
                rejected += stack.getAmount();
                continue;
            }

            WorkspaceStorage.Deposit result =
                    running.deposit(stack.getType(), stack.getAmount(), capacity);

            if (result.stored() <= 0) {
                full = true;
                continue;
            }

            running = result.storage();
            deposited += result.stored();
            afterwards[slot] = result.rejected();

            if (result.rejected() > 0) {
                full = true;
            }
        }

        workspaces.storage(workspace, running);

        // Only now, once the storage holds them.
        for (int slot = 0; slot < afterwards.length; slot++) {
            if (afterwards[slot] < 0) {
                continue;
            }

            ItemStack stack = contents[slot];

            if (afterwards[slot] == 0) {
                player.getInventory().setItem(slot, null);
            } else {
                stack.setAmount(afterwards[slot]);
                player.getInventory().setItem(slot, stack);
            }
        }

        if (deposited > 0) {
            player.sendMessage(messages.prefixed("progression.workspace.deposited",
                    "amount", MenuItems.number(deposited)));

            player.playSound(player.getLocation(), Sound.BLOCK_BARREL_CLOSE, 0.7f, 1.2f);
        }

        if (full) {
            player.sendMessage(messages.prefixed("progression.workspace.storage-full"));
        } else if (deposited == 0 && rejected > 0) {
            player.sendMessage(messages.prefixed("progression.workspace.nothing-storable"));
        }

        workspaces.byId(workspace.id())
                .ifPresent(updated -> player.openInventory(menu.buildStorage(updated, page)));
    }

    /**
     * Opens the workspace an NPC belongs to, for the seller and upgrade roles.
     *
     * Registered as the handler for those roles rather than being special-cased in the interaction
     * listener, so a future role plugs in the same way — see {@link WorkspaceNpcRole.Handler}.
     */
    public void openFromNpc(Player player, Workspace workspace) {
        // Routed through the same gate as a menu click, so clicking an NPC re-validates ownership and
        // evaluates the bill exactly as opening the panel from the jobs menu does. Two entry points
        // with two sets of checks is how one of them ends up missing one.
        with(player, workspace.id(), current -> {
            if (current.taxSuspended()) {
                player.sendMessage(messages.prefixed("progression.workspace.suspended-npc",
                        "amount", MenuItems.robs(tax.amountFor(current))));
            }

            menu.open(player, current);
        });
    }

    /** The owner of a workspace, for messages sent about it. */
    public Optional<UUID> ownerOf(String workspaceId) {
        return workspaces.byId(workspaceId).map(Workspace::owner);
    }
}
