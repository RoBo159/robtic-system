package org.robtic.minecraft.staff;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.config.RoleSettings;
import org.robtic.minecraft.model.PlayerProfile;
import org.robtic.minecraft.model.StaffRank;
import org.robtic.minecraft.service.PermissionSyncService;
import org.robtic.minecraft.service.PlayerDataService;
import org.robtic.minecraft.service.RoleSyncService;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * `/addstaff`, `/promotestaff`, `/demotestaff`, `/setstaffrole` and `/firestaff`.
 *
 * <h2>Nothing here knows a rank's name</h2>
 *
 * "Helper", "Moderator" and "Admin" appear nowhere in this class. Every rank comes from
 * {@link RoleSettings}, and promotion and demotion are movements through that configured ordering —
 * so a server that renames its ladder, adds a rung or reorders it needs no plugin change.
 *
 * <h2>The order of operations is the same as every other rank change</h2>
 *
 * <pre>
 *   LuckPerms  →  API audit  →  Discord mirror
 * </pre>
 *
 * The group change happens first because it is what actually makes somebody staff; the API records
 * it and applies the Discord role. If the API call fails the player is still correctly staff in
 * game, which is the right way round — the alternative leaves Discord claiming a rank the server
 * does not grant.
 *
 * <h2>Linked accounts</h2>
 *
 * Nobody may *become* staff without a linked Discord account: the audit trail and the Discord
 * mirror both need an identity. An existing staff member whose link is later removed can still be
 * promoted, demoted or fired — refusing that would leave them unmanageable.
 */
public final class StaffRosterCommands implements CommandExecutor, TabCompleter {

    private final ApiGateway gateway;
    private final ApiSettings api;
    private final MessageCatalog messages;
    private final RoleSettings roles;
    private final PermissionSyncService permissions;
    private final PlayerDataService players;
    private final RoleSyncService roleSync;
    private final StaffAvailabilityService availability;

    public StaffRosterCommands(
            ApiGateway gateway,
            ApiSettings api,
            MessageCatalog messages,
            RoleSettings roles,
            PermissionSyncService permissions,
            PlayerDataService players,
            RoleSyncService roleSync,
            StaffAvailabilityService availability
    ) {
        this.gateway = gateway;
        this.api = api;
        this.messages = messages;
        this.roles = roles;
        this.permissions = permissions;
        this.players = players;
        this.roleSync = roleSync;
        this.availability = availability;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!sender.hasPermission("robtic.staff.roster")) {
            sender.sendMessage(messages.prefixed("staff.no-permission"));
            return true;
        }

        if (!roles.hasRanks()) {
            sender.sendMessage(messages.prefixed("staff.rank-none-configured"));
            return true;
        }

        if (args.length == 0) {
            sender.sendMessage(messages.prefixed("staff.roster-usage"));
            return true;
        }

        String targetName = args[0];
        String requestedRole = args.length > 1 ? args[1] : null;

        switch (command.getName().toLowerCase(Locale.ROOT)) {
            case "addstaff" -> run(sender, targetName, "add", requestedRole);
            case "promotestaff" -> run(sender, targetName, "promote", null);
            case "demotestaff" -> run(sender, targetName, "demote", null);
            case "firestaff" -> run(sender, targetName, "fire", null);
            case "setstaffrole" -> {
                if (requestedRole == null) {
                    sender.sendMessage(messages.prefixed("staff.setrole-usage"));
                    return true;
                }
                run(sender, targetName, "set-role", requestedRole);
            }
            default -> {
                return false;
            }
        }

        return true;
    }

    /** What a roster change resolved to, before anything is applied. */
    private record Resolution(UUID uuid, String username, StaffRank from, StaffRank to, String failureKey, String detail) {

        static Resolution fail(String key) {
            return new Resolution(null, null, null, null, key, null);
        }

        static Resolution fail(String key, String detail) {
            return new Resolution(null, null, null, null, key, detail);
        }

        boolean failed() {
            return failureKey != null;
        }
    }

    /**
     * The one path all five commands take.
     *
     * Resolution happens off-thread — it may load a profile and read LuckPerms storage for an
     * offline player — and the application happens there too, because both the group write and the
     * API call block.
     */
    private void run(CommandSender sender, String targetName, String action, String requestedRole) {
        gateway.read(
                () -> {
                    Resolution resolution = resolve(targetName, action, requestedRole);
                    if (resolution.failed()) {
                        return resolution;
                    }

                    apply(sender, resolution, action);
                    return resolution;
                },
                resolution -> report(sender, resolution, action, targetName),
                error -> sender.sendMessage(messages.prefixed("survival.unavailable")));
    }

    /**
     * Works out who the target is and which rung they move to.
     *
     * Runs off-thread: an offline target needs a profile lookup, and LuckPerms may load their user
     * from its own storage.
     */
    private Resolution resolve(String targetName, String action, String requestedRole) {
        Player online = Bukkit.getPlayerExact(targetName);

        UUID uuid;
        String username;
        boolean linked;

        if (online != null) {
            uuid = online.getUniqueId();
            username = online.getName();
            linked = players.cached(uuid).map(PlayerProfile::linked).orElseGet(() -> {
                try {
                    return players.profile(uuid, username).linked();
                } catch (RuntimeException unavailable) {
                    return false;
                }
            });
        } else {
            try {
                PlayerProfile profile = players.profileByUsername(targetName);
                uuid = profile.uuid();
                username = profile.username();
                linked = profile.linked();
            } catch (RuntimeException notFound) {
                return Resolution.fail("staff.roster-unknown-player");
            }
        }

        Optional<StaffRank> current = roles.highestFor(permissions.groupsOf(uuid));

        return switch (action) {
            case "add" -> {
                if (current.isPresent()) {
                    yield Resolution.fail("staff.roster-already-staff");
                }
                if (!linked) {
                    yield Resolution.fail("staff.roster-not-linked");
                }

                // The FIRST configured rank, never a hardcoded group. `lowest()` is the bottom of
                // the ladder as roles.yml orders it.
                Optional<StaffRank> entry = requestedRole == null ? roles.lowest() : roles.byName(requestedRole);
                yield entry.map(rank -> new Resolution(uuid, username, null, rank, null, null))
                        .orElseGet(() -> Resolution.fail("staff.roster-unknown-rank", requestedRole));
            }

            case "promote" -> {
                if (current.isEmpty()) {
                    yield Resolution.fail("staff.roster-not-staff");
                }

                Optional<StaffRank> next = roles.above(current.get());
                yield next.map(rank -> new Resolution(uuid, username, current.get(), rank, null, null))
                        .orElseGet(() -> Resolution.fail("staff.roster-already-highest"));
            }

            case "demote" -> {
                if (current.isEmpty()) {
                    yield Resolution.fail("staff.roster-not-staff");
                }

                // The bottom rung stays staff: demoting off the ladder is what /firestaff is for,
                // and doing it silently here would remove somebody's access by accident.
                Optional<StaffRank> below = roles.below(current.get());
                yield below.map(rank -> new Resolution(uuid, username, current.get(), rank, null, null))
                        .orElseGet(() -> Resolution.fail("staff.roster-already-lowest"));
            }

            case "set-role" -> {
                if (current.isEmpty()) {
                    yield Resolution.fail("staff.roster-not-staff");
                }

                Optional<StaffRank> wanted = roles.byName(requestedRole);
                yield wanted.map(rank -> new Resolution(uuid, username, current.get(), rank, null, null))
                        .orElseGet(() -> Resolution.fail("staff.roster-unknown-rank", requestedRole));
            }

            case "fire" -> current
                    .map(rank -> new Resolution(uuid, username, rank, null, null, null))
                    .orElseGet(() -> Resolution.fail("staff.roster-not-staff"));

            default -> Resolution.fail("staff.roster-usage");
        };
    }

    /**
     * Applies the change: LuckPerms first, then the API audit and Discord mirror.
     *
     * Off-thread. A null target group removes every rank group, which is what firing means.
     */
    private void apply(CommandSender sender, Resolution resolution, String action) {
        String targetGroup = resolution.to() == null ? null : resolution.to().group();

        permissions.setRankGroup(resolution.uuid(), targetGroup, roles.rankGroups());

        // Queued so the ordinary mirror agrees with what was just applied, even if the call below
        // fails — the group is the authority and the mirror follows it either way.
        roleSync.markDirty(resolution.uuid());

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("action", action);
        body.addProperty("actorUuid", actorUuid(sender).toString());
        body.addProperty("actorUsername", sender.getName());
        body.addProperty("targetUuid", resolution.uuid().toString());
        body.addProperty("targetUsername", resolution.username());
        body.addProperty("fromRank", resolution.from() == null ? null : resolution.from().displayName());
        body.addProperty("toRank", resolution.to() == null ? null : resolution.to().displayName());

        if (resolution.to() != null && !resolution.to().discordRoleId().isBlank()) {
            body.addProperty("grantRoleId", resolution.to().discordRoleId());
        }

        // Every managed role is revoked apart from the one being granted, so a promotion cannot
        // leave somebody holding two ranks and firing clears the lot.
        JsonArray revoke = new JsonArray();
        for (String roleId : roles.managedRoleIds()) {
            revoke.add(roleId);
        }
        body.add("revokeRoleIds", revoke);

        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        String requestId = ApiGateway.requestIdFor("roster-" + action, resolution.uuid(), System.nanoTime());
        body.addProperty("requestId", requestId);

        gateway.client().post("/api/staff/manage", body, requestId);
    }

    /** The console has no uuid; a nil uuid keeps the audit shape valid without inventing one. */
    private static UUID actorUuid(CommandSender sender) {
        return sender instanceof Player player ? player.getUniqueId() : new UUID(0L, 0L);
    }

    private void report(CommandSender sender, Resolution resolution, String action, String targetName) {
        if (resolution.failed()) {
            sender.sendMessage(messages.prefixed(resolution.failureKey(),
                    "player", targetName,
                    "rank", resolution.detail() == null ? "" : resolution.detail(),
                    "ranks", rankNames()));
            return;
        }

        String key = switch (action) {
            case "add" -> "staff.roster-added";
            case "promote" -> "staff.roster-promoted";
            case "demote" -> "staff.roster-demoted";
            case "set-role" -> "staff.roster-role-set";
            default -> "staff.roster-fired";
        };

        sender.sendMessage(messages.prefixed(key,
                "player", resolution.username(),
                "from", resolution.from() == null ? "none" : resolution.from().displayName(),
                "to", resolution.to() == null ? "none" : resolution.to().displayName()));
    }

    private String rankNames() {
        return String.join(", ", roles.ranks().stream().map(StaffRank::displayName).toList());
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String alias, String[] args) {
        if (args.length == 1) {
            String prefix = args[0].toLowerCase(Locale.ROOT);
            return Bukkit.getOnlinePlayers().stream()
                    .map(Player::getName)
                    .filter(name -> name.toLowerCase(Locale.ROOT).startsWith(prefix))
                    .toList();
        }

        // The configured ladder, so an operator never has to remember how they named a rung.
        if (args.length == 2 && (command.getName().equalsIgnoreCase("setstaffrole")
                || command.getName().equalsIgnoreCase("addstaff"))) {
            String prefix = args[1].toLowerCase(Locale.ROOT);
            return roles.ranks().stream()
                    .map(StaffRank::id)
                    .filter(id -> id.startsWith(prefix))
                    .toList();
        }

        return List.of();
    }
}
