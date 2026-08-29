package org.robtic.minecraft.gui;

import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.robtic.minecraft.config.LobbySettings;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.config.StaffSettings;
import org.robtic.minecraft.model.Lobby;
import org.robtic.minecraft.model.Report;
import org.robtic.minecraft.staff.FreezeService;
import org.robtic.minecraft.staff.JailService;
import org.robtic.minecraft.staff.ReportService;
import org.robtic.minecraft.staff.StaffModeService;
import org.robtic.minecraft.staff.VanishService;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Builds and opens every staff menu.
 *
 * Rendering is separated from the click routing in {@link StaffMenuListener} for the same reason
 * the exchange menus already separate them: a menu that only builds inventories can be reasoned
 * about without thinking about untrusted input, and a router that only dispatches can cancel
 * every click before deciding anything.
 *
 * Nothing here performs network I/O — everything rendered comes from state the services already
 * hold, so a menu opens on the tick it was asked for.
 */
public final class StaffMenuFactory {

    private static final int PLAYER_MANAGE_SIZE = 45;
    private static final int INSPECT_SIZE = 45;
    private static final int REPORTS_SIZE = 54;
    private static final int REPORT_DETAIL_SIZE = 45;

    /** Report slots in the queue, leaving the last row for the footer. */
    private static final int REPORTS_CAPACITY = 45;

    private final MessageCatalog messages;
    private final StaffSettings staffSettings;
    private final LobbySettings lobbySettings;
    private final FreezeService freeze;
    private final JailService jail;
    private final VanishService vanish;
    private final StaffModeService staffMode;

    public StaffMenuFactory(
            MessageCatalog messages,
            StaffSettings staffSettings,
            LobbySettings lobbySettings,
            FreezeService freeze,
            JailService jail,
            VanishService vanish,
            StaffModeService staffMode
    ) {
        this.messages = messages;
        this.staffSettings = staffSettings;
        this.lobbySettings = lobbySettings;
        this.freeze = freeze;
        this.jail = jail;
        this.vanish = vanish;
        this.staffMode = staffMode;
    }

    /** The online-player grid, with ping, world, health and gamemode on each head. */
    public void openPlayerList(Player viewer) {
        openPlayerGrid(viewer, StaffMenuHolder.View.PLAYER_LIST, messages.text("menus.player-list-title"));
    }

    /**
     * The teleport menu.
     *
     * Shares the grid with the player list because the difference is only what a click does, and
     * duplicating the rendering would mean two places to fix a vanish-visibility bug.
     */
    public void openTeleportMenu(Player viewer) {
        openPlayerGrid(viewer, StaffMenuHolder.View.TELEPORT, messages.text("menus.teleport-title"));
    }

    private void openPlayerGrid(Player viewer, StaffMenuHolder.View view, String title) {
        List<Player> online = visibleTo(viewer);

        int rows = Math.min(staffSettings.playerListRows(), Math.max(1, (online.size() + 8) / 9));
        StaffMenuHolder holder = new StaffMenuHolder(view, null, null);
        Inventory inventory = Bukkit.createInventory(holder, rows * 9, MessageCatalog.render(title));
        holder.attach(inventory);

        for (int index = 0; index < online.size() && index < rows * 9; index++) {
            Player target = online.get(index);

            inventory.setItem(index, Icons.head(target, messages.text("menus.player-entry-name", "player", target.getName()),
                    List.of(
                            messages.text("menus.player-entry-ping", "ping", String.valueOf(target.getPing())),
                            messages.text("menus.player-entry-world", "world", target.getWorld().getName()),
                            messages.text("menus.player-entry-health", "health", String.valueOf(Math.round(target.getHealth()))),
                            messages.text("menus.player-entry-gamemode", "gamemode", prettyGameMode(target.getGameMode())),
                            "",
                            messages.text(view == StaffMenuHolder.View.TELEPORT
                                    ? "menus.player-entry-teleport-hint"
                                    : "menus.player-entry-manage-hint")
                    )));

            holder.bindPlayer(index, target.getUniqueId());
        }

        viewer.openInventory(inventory);
    }

    /**
     * Players this staff member may see.
     *
     * Vanished staff are filtered for anyone not in staff mode, so the teleport menu can never be
     * used to discover that a hidden moderator is watching.
     */
    private List<Player> visibleTo(Player viewer) {
        boolean viewerIsStaff = staffMode.isInStaffMode(viewer.getUniqueId());
        List<Player> visible = new ArrayList<>();

        for (Player online : Bukkit.getOnlinePlayers()) {
            if (online.equals(viewer)) {
                continue;
            }
            if (vanish.isVanished(online.getUniqueId()) && !viewerIsStaff) {
                continue;
            }
            visible.add(online);
        }

        return visible;
    }

    /** The per-player action panel. Every button is bound to an action id, never to a raw slot. */
    public void openPlayerManagement(Player viewer, UUID subject, String subjectName) {
        StaffMenuHolder holder = new StaffMenuHolder(StaffMenuHolder.View.PLAYER_MANAGE, subject, subjectName);
        Inventory inventory = Bukkit.createInventory(
                holder,
                PLAYER_MANAGE_SIZE,
                MessageCatalog.render(messages.text("menus.manage-title", "player", subjectName))
        );
        holder.attach(inventory);

        boolean isFrozen = freeze.isFrozen(subject);
        boolean isJailed = jail.isJailed(subject);

        button(inventory, holder, 10, isFrozen ? "manage_unfreeze" : "manage_freeze",
                isFrozen ? Material.REDSTONE_BLOCK : Material.PACKED_ICE,
                isFrozen ? "menus.button-unfreeze" : "menus.button-freeze");

        button(inventory, holder, 11, isJailed ? "manage_unjail" : "manage_jail",
                isJailed ? Material.LIME_CONCRETE : Material.IRON_BARS,
                isJailed ? "menus.button-unjail" : "menus.button-jail");

        button(inventory, holder, 12, "manage_teleport", Material.ENDER_PEARL, "menus.button-teleport");
        button(inventory, holder, 13, "manage_inspect_inventory", Material.CHEST, "menus.button-inspect");
        button(inventory, holder, 14, "manage_inspect_enderchest", Material.ENDER_CHEST, "menus.button-enderchest");
        button(inventory, holder, 15, "manage_jail_history", Material.BOOK, "menus.button-jail-history");
        button(inventory, holder, 16, "manage_warnings", Material.PAPER, "menus.button-warnings");
        button(inventory, holder, 19, "manage_punishments", Material.IRON_SWORD, "menus.button-punishments");
        button(inventory, holder, 20, "manage_notes", Material.WRITABLE_BOOK, "menus.button-notes");
        button(inventory, holder, 21, "manage_discord", Material.PLAYER_HEAD, "menus.button-discord");
        button(inventory, holder, 22, "manage_playtime", Material.CLOCK, "menus.button-playtime");
        button(inventory, holder, 40, "manage_back", Material.ARROW, "menus.button-back");

        fill(inventory);
        viewer.openInventory(inventory);
    }

    /** The lobby destinations, filtered to the ones this staff member may use. */
    public void openLobbyMenu(Player viewer) {
        List<Lobby> lobbies = lobbySettings.visibleTo(viewer);

        StaffMenuHolder holder = new StaffMenuHolder(StaffMenuHolder.View.LOBBY, null, null);
        Inventory inventory = Bukkit.createInventory(
                holder,
                lobbySettings.menuRows() * 9,
                MessageCatalog.render(lobbySettings.menuTitle())
        );
        holder.attach(inventory);

        int slot = 0;
        for (Lobby lobby : lobbies) {
            int target = lobby.slot() > 0 && lobby.slot() < inventory.getSize() ? lobby.slot() : slot;

            boolean loaded = lobby.toLocation() != null;
            inventory.setItem(target, Icons.of(
                    loaded ? lobby.icon() : Material.BARRIER,
                    lobby.displayName(),
                    loaded
                            ? messages.text("menus.lobby-hint")
                            : messages.text("menus.lobby-world-missing", "world", lobby.worldName())
            ));

            if (loaded) {
                holder.bindLobby(target, lobby.id());
            }

            slot++;
        }

        viewer.openInventory(inventory);
    }

    /**
     * A read-only copy of another player's inventory.
     *
     * A copy rather than the live inventory: opening the real one would let a moderator take items
     * out, and an inspection must not be able to change what it is inspecting.
     */
    public void openInventoryInspection(Player viewer, Player target) {
        StaffMenuHolder holder = new StaffMenuHolder(
                StaffMenuHolder.View.INSPECT_INVENTORY, target.getUniqueId(), target.getName());

        Inventory inventory = Bukkit.createInventory(
                holder,
                INSPECT_SIZE,
                MessageCatalog.render(messages.text("menus.inspect-title", "player", target.getName()))
        );
        holder.attach(inventory);

        org.bukkit.inventory.ItemStack[] contents = target.getInventory().getStorageContents();
        for (int index = 0; index < contents.length && index < 36; index++) {
            inventory.setItem(index, contents[index] == null ? null : contents[index].clone());
        }

        org.bukkit.inventory.ItemStack[] armor = target.getInventory().getArmorContents();
        for (int index = 0; index < armor.length; index++) {
            inventory.setItem(36 + index, armor[index] == null ? null : armor[index].clone());
        }

        org.bukkit.inventory.ItemStack offhand = target.getInventory().getItemInOffHand();
        inventory.setItem(40, offhand.getType() == Material.AIR ? null : offhand.clone());

        button(inventory, holder, 44, "manage_back", Material.ARROW, "menus.button-back");
        viewer.openInventory(inventory);
    }

    public void openEnderChestInspection(Player viewer, Player target) {
        StaffMenuHolder holder = new StaffMenuHolder(
                StaffMenuHolder.View.INSPECT_ENDERCHEST, target.getUniqueId(), target.getName());

        Inventory inventory = Bukkit.createInventory(
                holder,
                36,
                MessageCatalog.render(messages.text("menus.enderchest-title", "player", target.getName()))
        );
        holder.attach(inventory);

        org.bukkit.inventory.ItemStack[] contents = target.getEnderChest().getContents();
        for (int index = 0; index < contents.length && index < 27; index++) {
            inventory.setItem(index, contents[index] == null ? null : contents[index].clone());
        }

        button(inventory, holder, 35, "manage_back", Material.ARROW, "menus.button-back");
        viewer.openInventory(inventory);
    }

    /** The `/staff` dashboard: what is happening on the network right now. */
    public void openDashboard(Player viewer) {
        StaffMenuHolder holder = new StaffMenuHolder(StaffMenuHolder.View.DASHBOARD, null, null);
        Inventory inventory = Bukkit.createInventory(
                holder, 27, MessageCatalog.render(messages.text("menus.dashboard-title")));
        holder.attach(inventory);

        inventory.setItem(10, Icons.of(Material.PLAYER_HEAD, messages.text("menus.dashboard-online-staff"),
                messages.text("menus.dashboard-count", "count", String.valueOf(staffMode.activeStaff().size()))));

        inventory.setItem(11, Icons.of(Material.COMPASS, messages.text("menus.dashboard-players"),
                messages.text("menus.dashboard-count", "count", String.valueOf(Bukkit.getOnlinePlayers().size()))));

        inventory.setItem(12, Icons.of(Material.PACKED_ICE, messages.text("menus.dashboard-frozen"),
                messages.text("menus.dashboard-count", "count", String.valueOf(freeze.frozenPlayers().size()))));

        inventory.setItem(13, Icons.of(Material.IRON_BARS, messages.text("menus.dashboard-jailed"),
                messages.text("menus.dashboard-count", "count", String.valueOf(jail.jailedPlayers().size()))));

        inventory.setItem(14, Icons.of(Material.PAPER, messages.text("menus.dashboard-vanished"),
                messages.text("menus.dashboard-count", "count", String.valueOf(vanish.vanishedPlayers().size()))));

        button(inventory, holder, 15, "player_list", Material.BOOK, "menus.dashboard-open-players");
        button(inventory, holder, 16, "reports_menu", Material.WRITABLE_BOOK, "menus.dashboard-open-reports");

        fill(inventory);
        viewer.openInventory(inventory);
    }

    // ─── Reports ──────────────────────────────────────────────────────────────────────────────

    /**
     * The open report queue.
     *
     * Everything a staff member needs to triage without opening anything is on the hover: who
     * reported whom, where, why, and whether the reported player is still here. Opening a report is
     * for deciding it, not for finding out what it says.
     */
    public void openReports(Player viewer, List<Report> reports, ReportService service) {
        StaffMenuHolder holder = new StaffMenuHolder(StaffMenuHolder.View.REPORTS, null, null);
        Inventory inventory = Bukkit.createInventory(
                holder, REPORTS_SIZE, MessageCatalog.render(messages.text("menus.reports-title")));
        holder.attach(inventory);

        if (reports.isEmpty()) {
            inventory.setItem(22, Icons.of(Material.LIME_DYE,
                    messages.text("menus.reports-empty"),
                    List.of(messages.text("menus.reports-empty-hint"))));
        }

        for (int index = 0; index < reports.size() && index < REPORTS_CAPACITY; index++) {
            Report report = reports.get(index);

            inventory.setItem(index, Icons.of(
                    report.targetOnline() ? Material.WRITTEN_BOOK : Material.BOOK,
                    messages.text("menus.report-entry-name", "id", report.code(), "player", report.targetUsername()),
                    reportLore(report, service, false)));

            holder.bindReport(index, report.code());
        }

        button(inventory, holder, REPORTS_SIZE - 1, "staff_menu", Material.ARROW, "menus.button-back");

        fill(inventory);
        viewer.openInventory(inventory);
    }

    /**
     * One report, with the accept and refuse buttons.
     *
     * The Discord row is always present and says plainly when an account is not linked, rather than
     * being hidden. A staff member who cannot see a row does not know whether it is missing because
     * there is nothing to show or because the feature is off — and a guild that has not configured
     * Discord at all must still be able to read everything else about the report.
     */
    public void openReportDetail(Player viewer, Report report, ReportService service) {
        StaffMenuHolder holder = new StaffMenuHolder(
                StaffMenuHolder.View.REPORT_DETAIL, report.targetUuid(), report.targetUsername());
        holder.reportCode(report.code());

        Inventory inventory = Bukkit.createInventory(
                holder,
                REPORT_DETAIL_SIZE,
                MessageCatalog.render(messages.text("menus.report-detail-title", "id", report.code()))
        );
        holder.attach(inventory);

        inventory.setItem(4, Icons.of(Material.PAPER,
                messages.text("menus.report-entry-name", "id", report.code(), "player", report.targetUsername()),
                reportLore(report, service, true)));

        // The reported player and the reporter, as heads, so the two sides of the report are
        // distinguishable at a glance rather than by reading names off one item.
        if (report.targetUuid() != null) {
            inventory.setItem(11, Icons.head(
                    Bukkit.getOfflinePlayer(report.targetUuid()),
                    messages.text("menus.report-reported", "player", report.targetUsername()),
                    List.of(
                            messages.text(report.targetOnline() ? "menus.report-online" : "menus.report-offline"),
                            messages.text("menus.report-where", "where",
                                    service.describe(report.targetLocation(), report.targetOnline())),
                            messages.text("menus.report-discord", "discord", discordOf(report.targetDiscordId())))));
        }

        if (report.reporterUuid() != null) {
            inventory.setItem(15, Icons.head(
                    Bukkit.getOfflinePlayer(report.reporterUuid()),
                    messages.text("menus.report-reporter", "player", report.reporterUsername()),
                    List.of(
                            messages.text("menus.report-where", "where",
                                    service.describe(report.reporterLocation(), true)),
                            messages.text("menus.report-discord", "discord", discordOf(report.reporterDiscordId())))));
        }

        if (report.isOpen()) {
            button(inventory, holder, 20, "report_accept", Material.LIME_CONCRETE, "menus.report-accept");
            button(inventory, holder, 22, "report_claim", Material.ENDER_PEARL, "menus.report-claim");
            button(inventory, holder, 24, "report_refuse", Material.RED_CONCRETE, "menus.report-refuse");
        } else {
            inventory.setItem(22, Icons.of(Material.BARRIER,
                    messages.text("menus.report-settled", "status", report.status()),
                    List.of(messages.text("menus.report-settled-by",
                            "player", report.resolvedByUsername() == null ? "unknown" : report.resolvedByUsername()))));
        }

        button(inventory, holder, REPORT_DETAIL_SIZE - 1, "reports_menu", Material.ARROW, "menus.button-back");

        fill(inventory);
        viewer.openInventory(inventory);
    }

    /**
     * The hover text on a report.
     *
     * @param full whether to include the rows only the detail view has room for. The queue shows
     *             enough to triage; the detail view shows everything, because that is what opening
     *             one is for.
     */
    private List<String> reportLore(Report report, ReportService service, boolean full) {
        List<String> lore = new ArrayList<>();

        lore.add(messages.text("menus.report-lore-reporter", "player", report.reporterUsername()));
        lore.add(messages.text("menus.report-lore-reported", "player", report.targetUsername(),
                "state", messages.text(report.targetOnline() ? "menus.report-online" : "menus.report-offline")));
        lore.add("");
        lore.add(messages.text("menus.report-lore-reason", "reason", report.reason()));
        lore.add("");
        lore.add(messages.text("menus.report-lore-where", "where",
                service.describe(report.targetLocation(), report.targetOnline())));
        lore.add(messages.text("menus.report-lore-reporter-where", "where",
                service.describe(report.reporterLocation(), true)));

        if (full) {
            lore.add("");
            lore.add(messages.text("menus.report-lore-target-discord", "discord", discordOf(report.targetDiscordId())));
            lore.add(messages.text("menus.report-lore-reporter-discord", "discord", discordOf(report.reporterDiscordId())));
            lore.add(messages.text("menus.report-lore-status", "status", report.status()));
            lore.add(messages.text("menus.report-lore-filed", "date", report.createdAt()));
        }

        if (report.assignedToUsername() != null) {
            lore.add(messages.text("menus.report-lore-claimed", "player", report.assignedToUsername()));
        }

        if (!full) {
            lore.add("");
            lore.add(messages.text("menus.report-lore-hint"));
        }

        return lore;
    }

    /**
     * A Discord id, rendered.
     *
     * Says "not linked" rather than going blank, and works identically whether or not the guild has
     * configured Discord at all — the id is either on the report or it is not, and this menu never
     * asks Discord anything.
     */
    private String discordOf(String discordId) {
        return discordId == null || discordId.isBlank()
                ? messages.text("menus.report-no-discord")
                : discordId;
    }

    private void button(Inventory inventory, StaffMenuHolder holder, int slot, String actionId, Material material, String messageKey) {
        inventory.setItem(slot, Icons.of(material, messages.text(messageKey)));
        holder.bindAction(slot, actionId);
    }

    /** Fills the empty slots so a menu does not read as a half-populated chest. */
    private void fill(Inventory inventory) {
        for (int slot = 0; slot < inventory.getSize(); slot++) {
            if (inventory.getItem(slot) == null) {
                inventory.setItem(slot, Icons.filler());
            }
        }
    }

    private String prettyGameMode(GameMode mode) {
        String name = mode.name().toLowerCase();
        return Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }

    /** Exposed so the click router can render a title without rebuilding the catalog lookup. */
    public Component title(String key, Object... placeholders) {
        return messages.component(key, placeholders);
    }
}
