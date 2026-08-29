package org.robtic.minecraft.survival.friend;

import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.model.survival.SurvivalModels.Friend;
import org.robtic.minecraft.model.survival.SurvivalModels.Friends;
import org.robtic.minecraft.survival.SurvivalCacheService;
import org.robtic.minecraft.survival.gui.FriendsMenu;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * `/friend …` and `/friends`.
 *
 * <h2>Why the target must be online for the state-changing verbs</h2>
 *
 * Every verb here resolves its target through Bukkit's online list. The API keys friendships by
 * UUID and the plugin has no way to turn an arbitrary name into one without asking Mojang — which
 * is a network call this plugin has no business making, and one that would put a lookup in front
 * of a typo. Requiring the player to be online keeps the resolution local and exact.
 *
 * `accept`, `deny` and `remove` are the exception: they resolve against the *cached* friend list
 * and request list, both of which already carry the UUID, so those work for offline players.
 */
public final class FriendCommands implements CommandExecutor, TabCompleter {

    private final ApiGateway gateway;
    private final MessageCatalog messages;
    private final SurvivalCacheService cache;
    private final FriendTeleportService teleports;
    private final FriendsMenu menu;

    public FriendCommands(
            ApiGateway gateway,
            MessageCatalog messages,
            SurvivalCacheService cache,
            FriendTeleportService teleports,
            FriendsMenu menu
    ) {
        this.gateway = gateway;
        this.messages = messages;
        this.cache = cache;
        this.teleports = teleports;
        this.menu = menu;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("That command can only be run by a player.");
            return true;
        }

        if (!player.hasPermission("robtic.friend")) {
            player.sendMessage(messages.prefixed("staff.no-permission"));
            return true;
        }

        if (command.getName().equalsIgnoreCase("friends")) {
            openMenu(player);
            return true;
        }

        if (args.length == 0) {
            openMenu(player);
            return true;
        }

        switch (args[0].toLowerCase(Locale.ROOT)) {
            case "add" -> action(player, args, "add");
            case "accept" -> action(player, args, "accept");
            case "deny" -> action(player, args, "deny");
            case "remove" -> action(player, args, "remove");
            case "cancel" -> action(player, args, "cancel");
            case "list" -> openMenu(player);
            case "tp" -> teleport(player, args);
            case "tpaccept" -> tpAccept(player);
            case "tpdeny" -> tpDeny(player);
            case "settings" -> settings(player, args);
            default -> player.sendMessage(messages.prefixed("friend.usage"));
        }

        return true;
    }

    /** Always refreshed: online status is the point of the menu and changes constantly. */
    private void openMenu(Player player) {
        gateway.read(
                () -> cache.refreshFriends(player.getUniqueId(), onlineCsv()),
                friends -> menu.open(player, friends),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    /**
     * The state-changing verbs, which differ only in the word sent to the API.
     *
     * `add` needs an online target to resolve a UUID; the rest resolve from the cached lists, so
     * they work on somebody who has already logged off.
     */
    private void action(Player player, String[] args, String action) {
        if (args.length < 2) {
            player.sendMessage(messages.prefixed("friend.usage"));
            return;
        }

        String targetName = args[1];

        gateway.read(
                () -> {
                    Optional<TargetRef> target = resolve(player, targetName, action);
                    if (target.isEmpty()) {
                        return null;
                    }

                    String outcome = cache.friendAction(
                            player.getUniqueId(), player.getName(), action, target.get().uuid(), target.get().name());

                    return new ActionResult(outcome, target.get().name());
                },
                result -> {
                    if (result == null) {
                        player.sendMessage(messages.prefixed("friend.not-found", "player", targetName));
                        return;
                    }
                    report(player, action, result);
                },
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private record TargetRef(UUID uuid, String name) {
    }

    private record ActionResult(String outcome, String targetName) {
    }

    /**
     * Finds the target's UUID.
     *
     * Online first, because that is exact and free. Otherwise the cached friend and request lists
     * are searched, which covers accepting or removing somebody who is not connected. Runs
     * off-thread, so the cache load it may trigger is safe.
     */
    private Optional<TargetRef> resolve(Player player, String name, String action) {
        Player online = Bukkit.getPlayerExact(name);
        if (online != null) {
            return Optional.of(new TargetRef(online.getUniqueId(), online.getName()));
        }

        if (action.equals("add")) {
            return Optional.empty();
        }

        Friends friends = cache.loadFriends(player.getUniqueId(), onlineCsv());
        String wanted = name.toLowerCase(Locale.ROOT);

        Optional<TargetRef> fromFriends = friends.friends().stream()
                .filter(friend -> friend.username().toLowerCase(Locale.ROOT).equals(wanted))
                .map(friend -> new TargetRef(friend.uuid(), friend.username()))
                .findFirst();

        if (fromFriends.isPresent()) {
            return fromFriends;
        }

        return java.util.stream.Stream.concat(friends.incoming().stream(), friends.outgoing().stream())
                .filter(request -> request.username().toLowerCase(Locale.ROOT).equals(wanted))
                .map(request -> new TargetRef(request.uuid(), request.username()))
                .findFirst();
    }

    /** The API decided what actually happened; this only picks the sentence for it. */
    private void report(Player player, String action, ActionResult result) {
        String key = switch (result.outcome()) {
            case "requested" -> "friend.requested";
            case "accepted" -> "friend.accepted";
            case "denied" -> "friend.denied";
            case "removed" -> "friend.removed";
            case "cancelled" -> "friend.cancelled";
            case "already-friends" -> "friend.already";
            case "no-request" -> action.equals("remove") ? "friend.not-friends" : "friend.no-request";
            default -> "survival.unavailable";
        };

        player.sendMessage(messages.prefixed(key, "player", result.targetName()));
    }

    // ─── Teleport ─────────────────────────────────────────────────────────────────────────────

    private void teleport(Player player, String[] args) {
        if (args.length < 2) {
            player.sendMessage(messages.prefixed("friend.tp-usage"));
            return;
        }

        Player target = Bukkit.getPlayerExact(args[1]);
        if (target == null || target.equals(player)) {
            player.sendMessage(messages.prefixed("friend.not-online", "player", args[1]));
            return;
        }

        gateway.read(
                () -> cache.loadFriends(player.getUniqueId(), onlineCsv()),
                friends -> {
                    if (!friends.isFriend(target.getUniqueId())) {
                        player.sendMessage(messages.prefixed("friend.not-friends", "player", target.getName()));
                        return;
                    }

                    // The target's own preference decides, not the requester's.
                    boolean auto = friends.friends().stream()
                            .filter(friend -> friend.uuid().equals(target.getUniqueId()))
                            .findFirst()
                            .map(friend -> targetAllowsAuto(target))
                            .orElse(false);

                    if (auto) {
                        teleports.teleportNow(player, target);
                    } else {
                        teleports.requestTeleport(player, target);
                    }
                },
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    /**
     * Whether the target has opted into automatic friend teleports.
     *
     * Read from the target's own cached settings — warmed when they joined — so this costs nothing
     * and, importantly, reflects *their* choice rather than anything the requester controls.
     */
    private boolean targetAllowsAuto(Player target) {
        return cache.cachedFriends(target.getUniqueId()).map(Friends::autoAcceptTp).orElse(false);
    }

    private void tpAccept(Player player) {
        Optional<UUID> requester = teleports.accept(player.getUniqueId());

        if (requester.isEmpty()) {
            player.sendMessage(messages.prefixed("friend.tp-nothing"));
            return;
        }

        Player online = Bukkit.getPlayer(requester.get());
        if (online == null) {
            player.sendMessage(messages.prefixed("friend.tp-gone"));
            return;
        }

        teleports.teleportNow(online, player);
    }

    private void tpDeny(Player player) {
        Optional<String> requester = teleports.deny(player.getUniqueId());

        if (requester.isEmpty()) {
            player.sendMessage(messages.prefixed("friend.tp-nothing"));
            return;
        }

        player.sendMessage(messages.prefixed("friend.tp-denied-self", "player", requester.get()));

        Player online = Bukkit.getPlayerExact(requester.get());
        if (online != null) {
            online.sendMessage(messages.prefixed("friend.tp-denied", "player", player.getName()));
        }
    }

    // ─── Settings ─────────────────────────────────────────────────────────────────────────────

    private void settings(Player player, String[] args) {
        if (args.length < 2) {
            gateway.read(
                    () -> cache.loadFriends(player.getUniqueId(), onlineCsv()),
                    friends -> menu.openSettings(player, friends.autoAcceptTp()),
                    error -> player.sendMessage(messages.prefixed("survival.unavailable")));
            return;
        }

        String value = args[1].toLowerCase(Locale.ROOT);
        boolean auto = value.equals("auto") || value.equals("on") || value.equals("true");

        setAutoAccept(player, auto);
    }

    /** Shared by the command form and the settings menu. */
    public void setAutoAccept(Player player, boolean auto) {
        gateway.read(
                () -> cache.setFriendTpAuto(player.getUniqueId(), auto),
                applied -> player.sendMessage(messages.prefixed(
                        applied.friendTpAutoAccept() ? "friend.settings-auto" : "friend.settings-manual")),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    /** This server's connected players, which the API cannot know. */
    private String onlineCsv() {
        return String.join(",", Bukkit.getOnlinePlayers().stream()
                .map(online -> online.getUniqueId().toString())
                .toList());
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String alias, String[] args) {
        if (args.length == 1) {
            return List.of("add", "accept", "deny", "remove", "cancel", "list", "tp", "tpaccept", "tpdeny", "settings").stream()
                    .filter(verb -> verb.startsWith(args[0].toLowerCase(Locale.ROOT)))
                    .toList();
        }

        if (args.length == 2 && sender instanceof Player player) {
            String prefix = args[1].toLowerCase(Locale.ROOT);

            // From the cache only — completion fires per keystroke and must never hit the network.
            List<String> names = new ArrayList<>(cache.cachedFriends(player.getUniqueId())
                    .map(friends -> friends.friends().stream().map(Friend::username).toList())
                    .orElseGet(List::of));

            return names.stream().filter(name -> name.toLowerCase(Locale.ROOT).startsWith(prefix)).toList();
        }

        return List.of();
    }
}
