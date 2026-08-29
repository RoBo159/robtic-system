package org.robtic.essentials.survival.command;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.essentials.model.SurvivalModels.Home;
import org.robtic.essentials.model.SurvivalModels.Homes;
import org.robtic.essentials.model.SurvivalModels.StoredLocation;
import org.robtic.essentials.survival.SurvivalCacheService;
import org.robtic.essentials.survival.TeleportService;
import org.robtic.essentials.survival.gui.HomesMenu;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * `/sethome`, `/home`, `/homes`, `/renamehome` and `/delhome`.
 *
 * <h2>Where the limit comes from</h2>
 *
 * Nowhere in this class. The API refuses a home past the player's tier limit and says so, and this
 * simply relays the message. Checking it here as well would put a second copy of the rule in the
 * plugin, and the two would eventually disagree — the API's answer is the one that decides whether
 * the row is written, so it is the one worth showing.
 *
 * What *is* here is the cache: `/home <name>` reads the list from memory, so the common case is a
 * teleport with no request in front of it.
 */
public final class HomeCommands implements CommandExecutor, TabCompleter {

    /** The name a bare `/sethome` and a bare `/home` use. */
    private static final String DEFAULT_HOME = "home";

    private final ApiGateway gateway;
    private final MessageCatalog messages;
    private final SurvivalCacheService cache;
    private final TeleportService teleports;
    private final HomesMenu menu;

    public HomeCommands(
            ApiGateway gateway,
            MessageCatalog messages,
            SurvivalCacheService cache,
            TeleportService teleports,
            HomesMenu menu
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

        if (!player.hasPermission("robtic.home")) {
            player.sendMessage(messages.prefixed("staff.no-permission"));
            return true;
        }

        switch (command.getName().toLowerCase()) {
            case "sethome" -> setHome(player, args.length > 0 ? args[0] : DEFAULT_HOME);
            case "home" -> home(player, args.length > 0 ? args[0] : DEFAULT_HOME);
            case "homes" -> homes(player);
            case "delhome" -> delHome(player, args);
            case "renamehome" -> renameHome(player, args);
            default -> {
                return false;
            }
        }

        return true;
    }

    private void setHome(Player player, String rawName) {
        String name = normalise(rawName);

        if (name.isBlank()) {
            player.sendMessage(messages.prefixed("survival.home-bad-name"));
            return;
        }

        StoredLocation here = StoredLocation.of(player.getLocation());

        gateway.read(
                () -> cache.setHome(player.getUniqueId(), player.getName(), name, here),
                updated -> player.sendMessage(messages.prefixed("survival.home-set",
                        "name", name, "used", String.valueOf(updated.used()), "limit", String.valueOf(updated.limit()))),
                // CONFLICT is the limit being reached, which carries a sentence worth showing.
                error -> player.sendMessage("CONFLICT".equals(error.code())
                        ? MessageCatalog.render("&c" + error.getMessage())
                        : messages.prefixed("survival.unavailable")));
    }

    /**
     * Teleports to a home.
     *
     * The cached list is tried first and, when it is warm, the teleport happens with no request at
     * all. A cold cache falls through to a load — which is the "first `/home`" case the design
     * calls for, not a per-command fetch.
     */
    private void home(Player player, String rawName) {
        String name = normalise(rawName);

        Optional<Homes> cached = cache.cachedHomes(player.getUniqueId());
        if (cached.isPresent()) {
            teleportTo(player, cached.get(), name);
            return;
        }

        gateway.read(
                () -> cache.loadHomes(player.getUniqueId()),
                loaded -> teleportTo(player, loaded, name),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void teleportTo(Player player, Homes homes, String name) {
        Optional<Home> home = homes.byName(name);

        if (home.isEmpty()) {
            player.sendMessage(homes.homes().isEmpty()
                    ? messages.prefixed("survival.home-none")
                    : messages.prefixed("survival.home-missing", "name", name, "names", names(homes)));
            return;
        }

        teleports.teleport(player, home.get().location(), "survival.home-teleported", "name", name);
    }

    private void homes(Player player) {
        Optional<Homes> cached = cache.cachedHomes(player.getUniqueId());

        if (cached.isPresent()) {
            menu.open(player, cached.get());
            return;
        }

        gateway.read(
                () -> cache.loadHomes(player.getUniqueId()),
                loaded -> menu.open(player, loaded),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void delHome(Player player, String[] args) {
        if (args.length == 0) {
            player.sendMessage(messages.prefixed("survival.delhome-usage"));
            return;
        }

        String name = normalise(args[0]);

        gateway.read(
                () -> cache.deleteHome(player.getUniqueId(), name),
                updated -> player.sendMessage(messages.prefixed("survival.home-deleted",
                        "name", name, "used", String.valueOf(updated.used()), "limit", String.valueOf(updated.limit()))),
                error -> player.sendMessage("NOT_FOUND".equals(error.code())
                        ? messages.prefixed("survival.home-missing", "name", name, "names", "")
                        : messages.prefixed("survival.unavailable")));
    }

    private void renameHome(Player player, String[] args) {
        if (args.length < 2) {
            player.sendMessage(messages.prefixed("survival.renamehome-usage"));
            return;
        }

        String from = normalise(args[0]);
        String to = normalise(args[1]);

        gateway.read(
                () -> cache.renameHome(player.getUniqueId(), from, to),
                updated -> player.sendMessage(messages.prefixed("survival.home-renamed", "from", from, "to", to)),
                error -> player.sendMessage(switch (error.code()) {
                    case "NOT_FOUND" -> messages.prefixed("survival.home-missing", "name", from, "names", "");
                    case "CONFLICT" -> MessageCatalog.render("&c" + error.getMessage());
                    default -> messages.prefixed("survival.unavailable");
                }));
    }

    /**
     * Completes home names from the cache only.
     *
     * Tab completion fires on every keystroke, so it must never touch the network. A cold cache
     * completes nothing, which is the right trade — a brief absence of suggestions beats a request
     * per character.
     */
    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String alias, String[] args) {
        if (!(sender instanceof Player player) || args.length != 1) {
            return List.of();
        }

        String prefix = args[0].toLowerCase(Locale.ROOT);

        return cache.cachedHomes(player.getUniqueId())
                .map(homes -> homes.homes().stream()
                        .map(Home::name)
                        .filter(name -> name.startsWith(prefix))
                        .toList())
                .orElseGet(List::of);
    }

    private static String normalise(String raw) {
        return raw.toLowerCase(Locale.ROOT).trim();
    }

    private static String names(Homes homes) {
        return String.join(", ", homes.homes().stream().map(Home::name).toList());
    }
}
