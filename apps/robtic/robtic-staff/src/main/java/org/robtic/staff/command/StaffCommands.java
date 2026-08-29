package org.robtic.staff.command;

import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.api.ApiException;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.config.RoleSettings;
import org.robtic.core.config.ServerSettings;
import org.robtic.staff.gui.StaffMenuFactory;
import org.robtic.core.model.PlayerProfile;
import org.robtic.core.model.StaffRank;
import org.robtic.core.service.PermissionSyncService;
import org.robtic.core.service.RoleSyncService;
import org.robtic.core.service.PlayerDataService;
import org.robtic.staff.FreezeService;
import org.robtic.staff.JailService;
import org.robtic.staff.StaffChatService;
import org.robtic.staff.StaffModeService;
import org.robtic.staff.VanishService;
import org.robtic.core.util.Durations;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.logging.Level;

/**
 * The staff commands, registered from one class.
 *
 * They share a great deal — the same staff-mode gate, the same target resolution, the same
 * "players only" check — and splitting fifteen near-identical executors across fifteen files would
 * multiply that boilerplate without making any of them clearer. Each command's behaviour is one
 * method; the shared preconditions are enforced once, in {@link #requireStaff}.
 */
public final class StaffCommands implements CommandExecutor, TabCompleter {

    private final Plugin plugin;
    private final ApiSettings api;
    private final ServerSettings server;
    private final MessageCatalog messages;
    private final ApiGateway gateway;
    private final RoleSettings roles;

    private final PlayerDataService players;
    private final StaffModeService staffMode;
    private final StaffChatService staffChat;
    private final FreezeService freeze;
    private final JailService jail;
    private final VanishService vanish;
    private final StaffMenuFactory menus;
    private final PermissionSyncService permissions;
    private final RoleSyncService roleSync;
    private final org.robtic.staff.ReportService reports;

    public StaffCommands(
            Plugin plugin,
            ApiSettings api,
            ServerSettings server,
            MessageCatalog messages,
            ApiGateway gateway,
            RoleSettings roles,
            PlayerDataService players,
            StaffModeService staffMode,
            StaffChatService staffChat,
            FreezeService freeze,
            JailService jail,
            VanishService vanish,
            StaffMenuFactory menus,
            PermissionSyncService permissions,
            RoleSyncService roleSync,
            org.robtic.staff.ReportService reports
    ) {
        this.plugin = plugin;
        this.api = api;
        this.server = server;
        this.messages = messages;
        this.gateway = gateway;
        this.roles = roles;
        this.players = players;
        this.staffMode = staffMode;
        this.staffChat = staffChat;
        this.freeze = freeze;
        this.jail = jail;
        this.vanish = vanish;
        this.menus = menus;
        this.permissions = permissions;
        this.roleSync = roleSync;
        this.reports = reports;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("That command can only be run by a player.");
            return true;
        }

        switch (command.getName().toLowerCase()) {
            case "admin" -> staffMode.toggle(player);
            case "a" -> staffChatCommand(player, args);
            case "hide" -> hideCommand(player);
            case "staff" -> {
                if (args.length > 0 && (args[0].equalsIgnoreCase("promote") || args[0].equalsIgnoreCase("demote"))) {
                    rankCommand(player, args);
                } else if (args.length > 0 && args[0].equalsIgnoreCase("gate")) {
                    requireStaff(player, () -> adminGateCommand(player));
                } else {
                    requireStaff(player, () -> menus.openDashboard(player));
                }
            }
            case "freeze" -> requireStaff(player, () -> freezeCommand(player, args));
            case "jail" -> requireStaff(player, () -> {
                // Verbs under the command they belong to, rather than /jail-set and /jail-history
                // sitting beside it as separate top-level commands.
                if (args.length > 0 && args[0].equalsIgnoreCase("set")) {
                    jailSetCommand(player);
                } else if (args.length > 0 && args[0].equalsIgnoreCase("history")) {
                    lookupCommand(player, java.util.Arrays.copyOfRange(args, 1, args.length), "/api/staff/history");
                } else {
                    jailCommand(player, args);
                }
            });
            case "unjail" -> requireStaff(player, () -> unjailCommand(player, args));
            case "warn" -> requireStaff(player, () -> entryCommand(player, args, "/api/staff/warnings", "warn"));
            case "warnings" -> requireStaff(player, () -> lookupCommand(player, args, "/api/staff/warnings"));
            case "note" -> requireStaff(player, () -> entryCommand(player, args, "/api/staff/notes", "note"));
            case "notes" -> requireStaff(player, () -> lookupCommand(player, args, "/api/staff/notes"));
            case "report" -> reportCommand(player, args);
            default -> {
                return false;
            }
        }

        return true;
    }

    /**
     * The gate every staff command passes through.
     *
     * Membership is staff mode, not a permission node: the whole point of the design is that
     * Discord decides who is staff, and `/admin` is the only way in. A permission check here would
     * quietly reintroduce a second source of truth.
     */
    private void requireStaff(Player player, Runnable action) {
        if (!server.staffSystemEnabled()) {
            player.sendMessage(messages.prefixed("staff.system-disabled"));
            return;
        }

        if (!staffMode.isInStaffMode(player.getUniqueId())) {
            player.sendMessage(messages.prefixed("staff.not-in-staff-mode"));
            return;
        }

        action.run();
    }

    private void staffChatCommand(Player player, String[] args) {
        if (!staffChat.canUse(player)) {
            player.sendMessage(messages.prefixed("staff.not-in-staff-mode"));
            return;
        }

        if (args.length == 0) {
            player.sendMessage(messages.prefixed("staff-chat.usage"));
            return;
        }

        String rank = staffMode.rankOf(player.getUniqueId())
                .map(entry -> entry.displayName())
                .orElse(messages.text("staff-chat.default-rank"));

        staffChat.send(player, rank, String.join(" ", args));
    }

    /**
     * `/staff promote|demote <player> [rank]`.
     *
     * <h2>The LuckPerms group is the rank</h2>
     *
     * The group change is what actually promotes somebody, and it happens here, first. The API call
     * that follows records the change and updates Discord; it is the audit trail and the mirror,
     * not the mechanism.
     *
     * This used to work the other way round — the API granted a Discord role and the game server
     * waited to be told about it. That path is gone, and leaving it in place would have been worse
     * than useless: the role mirror computes what Discord *should* hold from the player's groups,
     * so a Discord role granted without a matching group would simply be revoked at the next sync.
     *
     * Gated on `robtic.staff.rank`, which is op-only by default and deliberately separate from
     * `robtic.staff` — being able to open the dashboard should not mean being able to promote.
     */
    private void rankCommand(Player player, String[] args) {
        if (!player.hasPermission("robtic.staff.rank")) {
            player.sendMessage(messages.prefixed("staff.no-permission"));
            return;
        }

        if (args.length < 2) {
            player.sendMessage(messages.prefixed("staff.rank-usage"));
            return;
        }

        String direction = args[0].toLowerCase();
        String targetName = args[1];
        String named = args.length > 2 ? args[2] : null;

        if (!roles.hasRanks()) {
            player.sendMessage(messages.prefixed("staff.rank-none-configured"));
            return;
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("direction", direction);
        body.addProperty("moderatorUuid", player.getUniqueId().toString());
        body.addProperty("moderatorUsername", player.getName());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        String requestId = ApiGateway.requestIdFor(direction, targetName, System.nanoTime());
        body.addProperty("requestId", requestId);

        gateway.read(
                () -> {
                    // The target's profile, for the uuid the API keys on.
                    Player online = Bukkit.getPlayerExact(targetName);
                    PlayerProfile profile = online != null
                            ? players.profile(online.getUniqueId(), targetName)
                            : players.profileByUsername(targetName);

                    // The whole ladder walk happens here, against roles.yml, using the target's
                    // LuckPerms groups. Works for an offline player too: LuckPerms loads the user
                    // from its own storage, so nothing about this depends on them being connected.
                    Optional<StaffRank> current = roles.highestFor(permissions.groupsOf(profile.uuid()));
                    Optional<StaffRank> target = named != null
                            ? roles.byName(named)
                            : "promote".equals(direction)
                                    ? current.map(rank -> roles.above(rank).orElse(null)).or(roles::lowest)
                                    : current.flatMap(roles::below);

                    if (named != null && target.isEmpty()) {
                        throw new ApiException("CONFLICT", 0, "There is no rank called \"" + named + "\" in roles.yml");
                    }

                    if ("promote".equals(direction) && target.isEmpty()) {
                        throw new ApiException("CONFLICT", 0, targetName + " already holds the highest rank");
                    }

                    if ("demote".equals(direction) && current.isEmpty()) {
                        throw new ApiException("CONFLICT", 0, targetName + " holds no staff rank to remove");
                    }

                    body.addProperty("targetUuid", profile.uuid().toString());

                    // The change itself: move the target into the new rank's group, removing every
                    // other managed group. A demote off the bottom rung passes null, which removes
                    // the rank without granting another.
                    boolean applied = permissions.setRankGroup(
                            profile.uuid(),
                            target.map(StaffRank::group).orElse(null),
                            roles.rankGroups());

                    if (!applied) {
                        throw new ApiException("CONFLICT", 0,
                                "LuckPerms is not available, so the rank could not be changed.");
                    }

                    // Queued so the Discord role follows even if the call below fails.
                    roleSync.markDirty(profile.uuid());

                    target.ifPresent(rank -> {
                        if (!rank.discordRoleId().isBlank()) {
                            body.addProperty("grantRoleId", rank.discordRoleId());
                        }
                        body.addProperty("toRank", rank.displayName());
                    });
                    current.ifPresent(rank -> {
                        if (!rank.discordRoleId().isBlank()) {
                            body.addProperty("revokeRoleId", rank.discordRoleId());
                        }
                        body.addProperty("fromRank", rank.displayName());
                    });

                    return gateway.client().post("/api/staff/rank", body, requestId);
                },
                response -> {
                    String from = optional(response, "from", "none");
                    String to = optional(response, "to", "none");
                    player.sendMessage(messages.prefixed("staff.rank-changed",
                            "player", targetName, "from", from, "to", to));
                },
                error -> {
                    // CONFLICT is the ordinary "already at the top" or "has no rank" answer, so it
                    // carries the API's own sentence rather than a generic failure line.
                    if ("CONFLICT".equals(error.code()) || "FORBIDDEN".equals(error.code())) {
                        player.sendMessage(MessageCatalog.render("&c" + error.getMessage()));
                        return;
                    }
                    player.sendMessage(messages.prefixed(reportRankFailure(targetName, error)));
                }
        );
    }

    private static String optional(JsonObject json, String key, String fallback) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsString() : fallback;
    }

    private String reportRankFailure(String target, ApiException error) {
        plugin.getLogger().warning("/staff rank failed for " + target + ": " + error.code() + " — " + error.getMessage());
        return "NOT_LINKED".equals(error.code()) ? "staff.rank-not-linked" : "robs.unavailable";
    }

    private void hideCommand(Player player) {
        requireStaff(player, () -> vanish.toggle(player));
    }

    private void freezeCommand(Player player, String[] args) {
        if (args.length == 0) {
            player.sendMessage(messages.prefixed("freeze.usage"));
            return;
        }

        Player target = Bukkit.getPlayerExact(args[0]);
        if (target == null) {
            player.sendMessage(messages.prefixed("staff.target-offline"));
            return;
        }

        if (freeze.isFrozen(target.getUniqueId())) {
            freeze.unfreeze(player, target);
            return;
        }

        String reason = args.length > 1
                ? String.join(" ", java.util.Arrays.copyOfRange(args, 1, args.length))
                : messages.text("freeze.default-reason");

        freeze.freeze(player, target, reason);
    }

    /** `/jail <player> <duration|perm> <reason...>` */
    private void jailCommand(Player player, String[] args) {
        if (args.length < 3) {
            player.sendMessage(messages.prefixed("jail.usage"));
            return;
        }

        Player target = Bukkit.getPlayerExact(args[0]);
        if (target == null) {
            player.sendMessage(messages.prefixed("staff.target-offline"));
            return;
        }

        if (!Durations.isValid(args[1])) {
            player.sendMessage(messages.prefixed("jail.bad-duration", "input", args[1]));
            return;
        }

        Long duration = Durations.parse(args[1]);
        String reason = String.join(" ", java.util.Arrays.copyOfRange(args, 2, args.length));

        jail.jail(player, target, duration, reason);
    }

    private void unjailCommand(Player player, String[] args) {
        if (args.length == 0) {
            player.sendMessage(messages.prefixed("jail.unjail-usage"));
            return;
        }

        Player target = Bukkit.getPlayerExact(args[0]);
        if (target == null) {
            player.sendMessage(messages.prefixed("staff.target-offline"));
            return;
        }

        String reason = args.length > 1
                ? String.join(" ", java.util.Arrays.copyOfRange(args, 1, args.length))
                : null;

        jail.release(player, target, reason);
    }

    /**
     * `/jail-set` — writes the jail location into config.yml.
     *
     * Persisted immediately rather than held in memory, because a jail location that vanishes on
     * restart would silently disable the whole jail system.
     */
    private void jailSetCommand(Player player) {
        saveLocation(player, "staff.jail", "jail.location-set", "jail.location-save-failed", "jail");
    }

    /**
     * `/set-admin-gate` — where `/admin` drops a staff member.
     *
     * The destination itself is not new: `staff.spawn` has always been read on entering staff mode.
     * What was missing was any way to set it without hand-editing a world name and six coordinates,
     * which is the same reason `/jail-set` exists. Standing where you want the gate and running this
     * is the whole workflow.
     */
    private void adminGateCommand(Player player) {
        saveLocation(player, "staff.spawn", "staff.gate-set", "staff.gate-save-failed", "admin gate");
    }

    /**
     * Writes the player's current position into config.yml under {@code path} and saves.
     *
     * Shared because the jail and the gate differ only in which key they write and which line the
     * player is shown — and a second copy of "read six fields off a Location and persist them" is
     * exactly the kind of duplication that lets one of them silently stop saving the pitch.
     */
    private void saveLocation(Player player, String path, String okKey, String failKey, String what) {
        Location location = player.getLocation();

        server.raw().set(path + ".world", location.getWorld().getName());
        server.raw().set(path + ".x", location.getX());
        server.raw().set(path + ".y", location.getY());
        server.raw().set(path + ".z", location.getZ());
        server.raw().set(path + ".yaw", location.getYaw());
        server.raw().set(path + ".pitch", location.getPitch());

        try {
            server.raw().save(new File(plugin.getDataFolder(), "config.yml"));
            player.sendMessage(messages.prefixed(okKey));
        } catch (IOException error) {
            plugin.getLogger().log(Level.WARNING, "Could not save the " + what + " location", error);
            player.sendMessage(messages.prefixed(failKey));
        }
    }

    /** `/warn` and `/note` share a body shape, so they share a handler. */
    private void entryCommand(Player player, String[] args, String path, String kind) {
        if (args.length < 2) {
            player.sendMessage(messages.prefixed("staff." + kind + "-usage"));
            return;
        }

        Player target = Bukkit.getPlayerExact(args[0]);
        if (target == null) {
            player.sendMessage(messages.prefixed("staff.target-offline"));
            return;
        }

        String text = String.join(" ", java.util.Arrays.copyOfRange(args, 1, args.length));

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("targetUuid", target.getUniqueId().toString());
        body.addProperty("targetUsername", target.getName());
        body.addProperty("authorUuid", player.getUniqueId().toString());
        body.addProperty("authorUsername", player.getName());
        body.addProperty("text", text);
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        String requestId = ApiGateway.newRequestId();
        body.addProperty("requestId", requestId);

        gateway.submit(path, body, requestId);
        player.sendMessage(messages.prefixed("staff." + kind + "-added", "player", target.getName()));
    }

    /** Reads a record list back and prints it in chat, where it can be read and copied. */
    private void lookupCommand(Player player, String[] args, String path) {
        if (args.length == 0) {
            player.sendMessage(messages.prefixed("staff.lookup-usage"));
            return;
        }

        Player target = Bukkit.getPlayerExact(args[0]);
        if (target == null) {
            player.sendMessage(messages.prefixed("staff.target-offline"));
            return;
        }

        gateway.read(
                () -> gateway.get(path, java.util.Map.of(
                        "guildId", api.guildId(),
                        "uuid", target.getUniqueId().toString()
                )),
                response -> {
                    var items = response.getAsJsonArray("items");

                    if (items == null || items.isEmpty()) {
                        player.sendMessage(messages.prefixed("staff.lookup-empty", "player", target.getName()));
                        return;
                    }

                    player.sendMessage(messages.prefixed("staff.lookup-header",
                            "player", target.getName(), "count", String.valueOf(items.size())));

                    for (var element : items) {
                        JsonObject row = element.getAsJsonObject();
                        player.sendMessage(messages.component("staff.lookup-entry",
                                "text", firstPresent(row, "reason", "text"),
                                "author", firstPresent(row, "issuedByUsername", "authorUsername", "moderatorUsername"),
                                "date", firstPresent(row, "createdAt", "jailedAt")));
                    }
                },
                error -> player.sendMessage(messages.prefixed("staff.lookup-failed"))
        );
    }

    /**
     * `/report <player> <reason...>`, plus the staff verbs that act on one.
     *
     * Filing is open to everyone. `accept`, `refuse`, `list`, `close` and `dismiss` are staff verbs,
     * and the report service checks whether the caller is on duty rather than this dispatcher.
     */
    private void reportCommand(Player player, String[] args) {
        if (args.length == 0) {
            player.sendMessage(messages.prefixed("report.usage"));
            return;
        }

        switch (args[0].toLowerCase(java.util.Locale.ROOT)) {
            // `/report accept <id> [duration]`. The duration is optional; without one the sentence
            // is indefinite, which is the safe default for a report a staff member has just upheld.
            case "accept" -> requireId(player, args, id -> reports.accept(player, id, args.length > 2 ? args[2] : null));
            case "refuse", "deny", "reject" -> requireId(player, args, id -> reports.refuse(player, id));
            case "claim" -> requireId(player, args, id -> reports.byCode(player, id, report -> reports.claim(player, report.id())));
            case "list" -> requireStaff(player, () ->
                    reports.openReports(player, queue -> menus.openReports(player, queue, reports)));
            case "close", "resolve" -> reports.close(player, "resolved", tail(args, 1));
            case "dismiss" -> reports.close(player, "dismissed", tail(args, 1));
            default -> fileReport(player, args);
        }
    }

    /** The staff verbs all take an id, and all say the same thing when it is missing. */
    private void requireId(Player player, String[] args, java.util.function.Consumer<String> action) {
        if (args.length < 2) {
            player.sendMessage(messages.prefixed("report.id-usage"));
            return;
        }

        action.accept(args[1]);
    }

    /**
     * The ordinary form: report a player by name.
     *
     * The name is not resolved here. A reported player is very often the one who has just logged
     * off — which is exactly when somebody wants to report them — so resolution happens in the
     * report service, off the main thread, against the online players, this server's user cache and
     * then the API in turn. This only parses arguments.
     */
    private void fileReport(Player player, String[] args) {
        if (args.length < 2) {
            player.sendMessage(messages.prefixed("report.usage"));
            return;
        }

        reports.file(player, args[0], String.join(" ", java.util.Arrays.copyOfRange(args, 1, args.length)));
    }

    /** The remaining arguments as one string, or null when there are none. */
    private static String tail(String[] args, int from) {
        return args.length <= from
                ? null
                : String.join(" ", java.util.Arrays.copyOfRange(args, from, args.length));
    }

    private String firstPresent(JsonObject row, String... keys) {
        for (String key : keys) {
            if (row.has(key) && !row.get(key).isJsonNull()) {
                return row.get(key).getAsString();
            }
        }
        return "";
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (args.length != 1) {
            return List.of();
        }

        List<String> names = new ArrayList<>();
        for (Player online : Bukkit.getOnlinePlayers()) {
            if (online.getName().toLowerCase().startsWith(args[0].toLowerCase())) {
                names.add(online.getName());
            }
        }
        return names;
    }
}
