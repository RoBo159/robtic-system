package org.robtic.staff.listener;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.InventoryHolder;
import org.robtic.staff.config.LobbySettings;
import org.robtic.core.config.MessageCatalog;
import org.robtic.staff.gui.StaffMenuFactory;
import org.robtic.staff.gui.StaffMenuHolder;
import org.robtic.staff.model.Lobby;
import org.robtic.staff.service.StaffLogService;
import org.robtic.staff.FreezeService;
import org.robtic.staff.JailService;
import org.robtic.staff.ReportService;
import org.robtic.staff.StaffActionDispatcher;

import java.util.UUID;

/**
 * Routes clicks in the staff menus.
 *
 * Every interaction with a staff inventory is cancelled **before** anything else runs. The
 * inspection views in particular contain clones of another player's items, and without the
 * unconditional cancel a moderator could drag them out and duplicate them.
 */
public final class StaffMenuListener implements Listener {

    private final StaffMenuFactory menus;
    private final StaffActionDispatcher dispatcher;
    private final FreezeService freeze;
    private final JailService jail;
    private final LobbySettings lobbies;
    private final MessageCatalog messages;
    private final StaffLogService log;
    private final ReportService reports;

    public StaffMenuListener(
            StaffMenuFactory menus,
            StaffActionDispatcher dispatcher,
            FreezeService freeze,
            JailService jail,
            LobbySettings lobbies,
            MessageCatalog messages,
            StaffLogService log,
            ReportService reports
    ) {
        this.menus = menus;
        this.dispatcher = dispatcher;
        this.freeze = freeze;
        this.jail = jail;
        this.lobbies = lobbies;
        this.messages = messages;
        this.log = log;
        this.reports = reports;
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (holderOf(event.getInventory().getHolder()) != null) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        StaffMenuHolder holder = holderOf(event.getInventory().getHolder());
        if (holder == null) {
            return;
        }

        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player staff)) {
            return;
        }

        // Clicks in the player's own inventory while a menu is open are cancelled, not acted on.
        if (event.getClickedInventory() == null || !event.getClickedInventory().equals(event.getInventory())) {
            return;
        }

        switch (holder.view()) {
            case PLAYER_LIST -> openManagement(staff, holder, event.getSlot());
            case TELEPORT -> teleport(staff, holder, event.getSlot());
            case LOBBY -> travel(staff, holder, event.getSlot());
            case REPORTS -> openReport(staff, holder, event.getSlot());
            case PLAYER_MANAGE, INSPECT_INVENTORY, INSPECT_ENDERCHEST, DASHBOARD, REPORT_DETAIL ->
                    runAction(staff, holder, event.getSlot());
            case HISTORY -> {
                // Read-only; the back button is handled by the shared action path.
                runAction(staff, holder, event.getSlot());
            }
        }
    }

    /**
     * Opens one report from the queue.
     *
     * The back button in this view is an action, not a report, so an unbound slot falls through to
     * the shared action path rather than being ignored.
     */
    private void openReport(Player staff, StaffMenuHolder holder, int slot) {
        String code = holder.reportAt(slot);

        if (code == null) {
            runAction(staff, holder, slot);
            return;
        }

        reports.byCode(staff, code, report -> menus.openReportDetail(staff, report, reports));
    }

    private void openManagement(Player staff, StaffMenuHolder holder, int slot) {
        UUID target = holder.playerAt(slot);
        if (target == null) {
            return;
        }

        Player online = Bukkit.getPlayer(target);
        menus.openPlayerManagement(staff, target, online == null ? "Unknown" : online.getName());
    }

    private void teleport(Player staff, StaffMenuHolder holder, int slot) {
        UUID target = holder.playerAt(slot);
        if (target == null) {
            return;
        }

        Player online = Bukkit.getPlayer(target);
        if (online == null) {
            staff.sendMessage(messages.prefixed("staff.target-offline"));
            return;
        }

        staff.closeInventory();
        dispatcher.rememberAndTeleport(staff, online.getLocation());
        staff.sendMessage(messages.prefixed("tools.teleported", "player", online.getName()));

        log.action("teleport").actor(staff.getUniqueId(), staff.getName())
                .target(online.getUniqueId(), online.getName()).submit();
    }

    private void travel(Player staff, StaffMenuHolder holder, int slot) {
        String lobbyId = holder.lobbyAt(slot);
        if (lobbyId == null) {
            return;
        }

        Lobby lobby = lobbies.all().stream().filter(entry -> entry.id().equals(lobbyId)).findFirst().orElse(null);
        if (lobby == null) {
            return;
        }

        var destination = lobby.toLocation();
        if (destination == null) {
            staff.sendMessage(messages.prefixed("menus.lobby-world-missing", "world", lobby.worldName()));
            return;
        }

        staff.closeInventory();
        dispatcher.rememberAndTeleport(staff, destination);
        staff.sendMessage(messages.prefixed("tools.teleported-lobby", "lobby", lobby.displayName()));
    }

    /**
     * Dispatches a bound button.
     *
     * The management buttons act on the holder's subject rather than on whatever the staff member
     * is looking at, so a panel opened for one player cannot be made to punish another by moving
     * the crosshair mid-click.
     */
    private void runAction(Player staff, StaffMenuHolder holder, int slot) {
        String action = holder.actionAt(slot);
        if (action == null) {
            return;
        }

        UUID subject = holder.subject();
        Player target = subject == null ? null : Bukkit.getPlayer(subject);

        switch (action) {
            case "manage_back" -> menus.openPlayerList(staff);
            case "player_list" -> menus.openPlayerList(staff);

            case "reports_menu" -> reports.openReports(staff, queue -> menus.openReports(staff, queue, reports));

            // The decision is sent, the menu is closed, and the queue is not reopened: the report
            // this staff member was looking at is settled, and dropping them back into a list still
            // showing it — the API is the authority on that, not this client's copy — would invite a
            // second click on a report that is already gone.
            case "report_accept" -> withReport(staff, holder, code -> {
                staff.closeInventory();
                reports.accept(staff, code, null);
            });

            case "report_refuse" -> withReport(staff, holder, code -> {
                staff.closeInventory();
                reports.refuse(staff, code);
            });

            case "report_claim" -> withReport(staff, holder, code -> {
                staff.closeInventory();
                reports.byCode(staff, code, report -> reports.claim(staff, report.id()));
            });

            case "manage_freeze" -> withTarget(staff, target, player -> {
                freeze.freeze(staff, player, messages.text("freeze.default-reason"));
                menus.openPlayerManagement(staff, player.getUniqueId(), player.getName());
            });

            case "manage_unfreeze" -> withTarget(staff, target, player -> {
                freeze.unfreeze(staff, player);
                menus.openPlayerManagement(staff, player.getUniqueId(), player.getName());
            });

            case "manage_jail" -> withTarget(staff, target, player -> {
                staff.closeInventory();
                staff.sendMessage(messages.prefixed("jail.use-command", "player", player.getName()));
            });

            case "manage_unjail" -> withTarget(staff, target, player -> {
                jail.release(staff, player, messages.text("jail.released-via-menu"));
                menus.openPlayerManagement(staff, player.getUniqueId(), player.getName());
            });

            case "manage_teleport" -> withTarget(staff, target, player -> {
                staff.closeInventory();
                dispatcher.rememberAndTeleport(staff, player.getLocation());
                log.action("teleport").actor(staff.getUniqueId(), staff.getName())
                        .target(player.getUniqueId(), player.getName()).submit();
            });

            case "manage_inspect_inventory" -> withTarget(staff, target, player -> {
                menus.openInventoryInspection(staff, player);
                log.action("inventory_inspect").actor(staff.getUniqueId(), staff.getName())
                        .target(player.getUniqueId(), player.getName()).submit();
            });

            case "manage_inspect_enderchest" -> withTarget(staff, target, player -> {
                menus.openEnderChestInspection(staff, player);
                log.action("enderchest_inspect").actor(staff.getUniqueId(), staff.getName())
                        .target(player.getUniqueId(), player.getName()).submit();
            });

            // The record views are text rather than menus: a paginated chest GUI of free-form
            // reasons reads far worse than the same lines in chat, where they can be copied.
            case "manage_jail_history" -> runCommand(staff, holder, "jail-history");
            case "manage_warnings" -> runCommand(staff, holder, "warnings");
            case "manage_notes" -> runCommand(staff, holder, "notes");
            case "manage_punishments" -> runCommand(staff, holder, "jail-history");
            case "manage_discord", "manage_playtime" -> runCommand(staff, holder, "lookup");

            default -> dispatcher.dispatch(action, staff, target);
        }
    }

    private void runCommand(Player staff, StaffMenuHolder holder, String command) {
        if (holder.subjectName() == null) {
            return;
        }
        staff.closeInventory();
        staff.performCommand(command + " " + holder.subjectName());
    }

    /** Runs an action against the report a detail view is about, which the holder carries. */
    private void withReport(Player staff, StaffMenuHolder holder, java.util.function.Consumer<String> action) {
        String code = holder.reportCode();

        if (code == null) {
            return;
        }

        action.accept(code);
    }

    private void withTarget(Player staff, Player target, java.util.function.Consumer<Player> action) {
        if (target == null || !target.isOnline()) {
            staff.sendMessage(messages.prefixed("staff.target-offline"));
            return;
        }
        action.accept(target);
    }

    private StaffMenuHolder holderOf(InventoryHolder holder) {
        return holder instanceof StaffMenuHolder staffHolder ? staffHolder : null;
    }
}
