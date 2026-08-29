package org.robtic.minecraft.license.commands;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.license.LicenseService;
import org.robtic.minecraft.license.api.License;
import org.robtic.minecraft.license.api.LicenseHolding;
import org.robtic.minecraft.license.citizens.LicenseNpcHook;
import org.robtic.minecraft.license.citizens.LicenseNpcStore;
import org.robtic.minecraft.license.events.PlayerLoseLicenseEvent;
import org.robtic.minecraft.license.events.PlayerObtainLicenseEvent;
import org.robtic.minecraft.license.gui.LicenseBrowser;
import org.robtic.minecraft.license.item.LicenseItemFactory;
import org.robtic.minecraft.util.Robs;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * `/license` — everything an operator and a player does with licences.
 *
 * <h2>One command with verbs</h2>
 *
 * Structured rather than spread across a dozen top-level names, so the whole system is discoverable
 * from `/license` alone.
 *
 * <h2>Permissions are per verb</h2>
 *
 * A player needs nothing to check their own licences; an operator needs
 * {@code robtic.license.admin} to issue, revoke or expire one. The split matters because the browser
 * and {@code /license check} are things a server wants everybody to have, and {@code give} is not.
 *
 * <h2>Console where it makes sense</h2>
 *
 * Anything naming a player works from the console. Anything about "you" — the browser, renewing —
 * does not, and says so rather than guessing whose licence it means.
 */
public final class LicenseCommand implements CommandExecutor, TabCompleter {

    private static final String ADMIN = "robtic.license.admin";
    private static final String USE = "robtic.license.use";

    private static final List<String> VERBS = List.of(
            "help", "list", "info", "check", "renew", "give", "remove",
            "setnpc", "removenpc", "expire", "reload", "debug");

    private final org.bukkit.plugin.Plugin plugin;
    private final LicenseService licenses;
    private final LicenseBrowser browser;
    private final LicenseNpcStore npcs;
    private final MessageCatalog messages;
    private final Runnable reload;

    /** Absent on a server without Citizens, which disables only the NPC verbs. */
    private final java.util.function.Supplier<Optional<LicenseNpcHook>> citizens;

    public LicenseCommand(
            org.bukkit.plugin.Plugin plugin,
            LicenseService licenses,
            LicenseBrowser browser,
            LicenseNpcStore npcs,
            MessageCatalog messages,
            Runnable reload,
            java.util.function.Supplier<Optional<LicenseNpcHook>> citizens
    ) {
        this.plugin = plugin;
        this.licenses = licenses;
        this.browser = browser;
        this.npcs = npcs;
        this.messages = messages;
        this.reload = reload;
        this.citizens = citizens;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {

        if (args.length == 0) {
            openOrHelp(sender);
            return true;
        }

        String verb = args[0].toLowerCase(Locale.ROOT);
        String[] rest = Arrays.copyOfRange(args, 1, args.length);

        switch (verb) {
            case "help" -> help(sender);
            case "list" -> list(sender);
            case "info" -> info(sender, rest);
            case "check" -> check(sender, rest);
            case "renew" -> renew(sender, rest);
            case "give" -> give(sender, rest);
            case "remove" -> remove(sender, rest);
            case "expire" -> expire(sender, rest);
            case "setnpc" -> setNpc(sender);
            case "removenpc" -> removeNpc(sender);
            case "debug" -> debug(sender);
            case "reload" -> {
                if (!allowed(sender, ADMIN)) {
                    return true;
                }

                reload.run();
                sender.sendMessage(messages.prefixed("license.reloaded"));
            }
            default -> help(sender);
        }

        return true;
    }

    // ─── Player verbs ─────────────────────────────────────────────────────────────────────────

    /** Bare `/license` opens the browser for a player, and prints help for the console. */
    private void openOrHelp(CommandSender sender) {
        if (sender instanceof Player player && player.hasPermission(USE)) {
            browser.open(player);
            return;
        }

        help(sender);
    }

    private void help(CommandSender sender) {
        messages.lines("license.help").forEach(sender::sendMessage);
    }

    /** Every registered licence, one line each. */
    private void list(CommandSender sender) {
        List<License> all = licenses.all();

        if (all.isEmpty()) {
            sender.sendMessage(messages.prefixed("license.none-registered"));
            return;
        }

        sender.sendMessage(messages.prefixed("license.list-header",
                "count", String.valueOf(all.size())));

        for (License license : all) {
            sender.sendMessage(messages.component("license.list-entry",
                    "id", license.id(),
                    "name", license.display(),
                    "category", licenses.registry().category(license.categoryId()).display()));
        }
    }

    /** Everything about one licence, whoever is asking. */
    private void info(CommandSender sender, String[] args) {
        if (args.length == 0) {
            sender.sendMessage(messages.prefixed("license.usage-info"));
            return;
        }

        Optional<License> found = licenses.definition(args[0]);

        if (found.isEmpty()) {
            sender.sendMessage(messages.prefixed("license.unknown", "license", args[0]));
            return;
        }

        License license = found.get();

        sender.sendMessage(messages.prefixed("license.info-header", "name", license.display()));

        sender.sendMessage(messages.component("license.info-id", "id", license.id()));
        sender.sendMessage(messages.component("license.info-category",
                "category", licenses.registry().category(license.categoryId()).display()));
        sender.sendMessage(messages.component("license.info-rarity", "rarity", license.rarity()));

        sender.sendMessage(messages.component("license.info-duration",
                "duration", license.permanent()
                        ? messages.text("license.permanent")
                        : LicenseItemFactory.describe(license.initialPeriod())));

        if (license.canRenew()) {
            sender.sendMessage(messages.component("license.info-renewal",
                    "cost", Robs.format(license.renewalCost()),
                    "period", LicenseItemFactory.describe(license.renewalPeriod())));
        }

        license.acquisition().forEach(line ->
                sender.sendMessage(messages.component("license.info-obtain", "text", line)));
    }

    /**
     * What licences somebody holds.
     *
     * With no argument, the sender's own. With one, another player's — which needs the admin
     * permission, because who holds what is not everybody's business.
     */
    private void check(CommandSender sender, String[] args) {
        Player target;

        if (args.length == 0) {
            if (!(sender instanceof Player self)) {
                sender.sendMessage(messages.prefixed("license.player-only"));
                return;
            }

            target = self;
        } else {
            if (!allowed(sender, ADMIN)) {
                return;
            }

            target = sender.getServer().getPlayerExact(args[0]);

            if (target == null) {
                sender.sendMessage(messages.prefixed("license.player-offline", "player", args[0]));
                return;
            }
        }

        Map<String, LicenseHolding> held = licenses.heldBy(target);

        if (held.isEmpty()) {
            sender.sendMessage(messages.prefixed("license.check-none", "player", target.getName()));
            return;
        }

        long now = System.currentTimeMillis();

        sender.sendMessage(messages.prefixed("license.check-header",
                "player", target.getName(), "count", String.valueOf(held.size())));

        for (LicenseHolding holding : held.values()) {
            sender.sendMessage(messages.component("license.check-entry",
                    "name", holding.license().display(),
                    "status", messages.text(holding.expired(now)
                            ? "license.status-expired"
                            : holding.permanent() ? "license.status-permanent" : "license.status-valid"),
                    "remaining", holding.permanent()
                            ? messages.text("license.permanent")
                            : LicenseItemFactory.describe(holding.remaining(now))));
        }
    }

    /**
     * Renews the sender's own licence, from the command line.
     *
     * The brief says renewal happens at the NPC, and the browser is where a player does it. This
     * exists for a server with no Citizens installed, which would otherwise have licences that can
     * expire and never be renewed — a state nothing else in the system can recover from.
     */
    private void renew(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(messages.prefixed("license.player-only"));
            return;
        }

        if (args.length == 0) {
            sender.sendMessage(messages.prefixed("license.usage-renew"));
            return;
        }

        String licenseId = args[0];

        if (licenses.definition(licenseId).isEmpty()) {
            sender.sendMessage(messages.prefixed("license.unknown", "license", licenseId));
            return;
        }

        // Off the tick: charging crosses a network, and holding the main thread for an HTTP request
        // is not something a chat command should do.
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            LicenseService.RenewResult result = licenses.renew(player, licenseId);

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                String name = licenses.definition(licenseId).map(License::display).orElse(licenseId);

                player.sendMessage(messages.prefixed(switch (result) {
                    case SUCCESS -> "license.renewed";
                    case NOT_HELD -> "license.renew-not-held";
                    case NOT_RENEWABLE -> "license.renew-not-renewable";
                    case PERMANENT -> "license.renew-permanent";
                    case CANNOT_AFFORD -> "license.renew-cannot-afford";
                    case ECONOMY_UNAVAILABLE -> "license.renew-unavailable";
                }, "license", name));
            });
        });
    }

    // ─── Operator verbs ───────────────────────────────────────────────────────────────────────

    private void give(CommandSender sender, String[] args) {
        if (!allowed(sender, ADMIN)) {
            return;
        }

        if (args.length < 2) {
            sender.sendMessage(messages.prefixed("license.usage-give"));
            return;
        }

        Player target = sender.getServer().getPlayerExact(args[0]);

        if (target == null) {
            sender.sendMessage(messages.prefixed("license.player-offline", "player", args[0]));
            return;
        }

        String licenseId = args[1];

        if (licenses.definition(licenseId).isEmpty()) {
            sender.sendMessage(messages.prefixed("license.unknown", "license", licenseId));
            return;
        }

        if (licenses.grant(target, licenseId, PlayerObtainLicenseEvent.Source.ADMIN)) {
            String name = licenses.definition(licenseId).map(License::display).orElse(licenseId);

            sender.sendMessage(messages.prefixed("license.gave",
                    "player", target.getName(), "license", name));

            target.sendMessage(messages.prefixed("license.received", "license", name));
        } else {
            sender.sendMessage(messages.prefixed("license.give-failed", "license", licenseId));
        }
    }

    private void remove(CommandSender sender, String[] args) {
        if (!allowed(sender, ADMIN)) {
            return;
        }

        if (args.length < 2) {
            sender.sendMessage(messages.prefixed("license.usage-remove"));
            return;
        }

        Player target = sender.getServer().getPlayerExact(args[0]);

        if (target == null) {
            sender.sendMessage(messages.prefixed("license.player-offline", "player", args[0]));
            return;
        }

        String licenseId = args[1];

        if (licenses.revoke(target, licenseId, PlayerLoseLicenseEvent.Reason.REVOKED)) {
            sender.sendMessage(messages.prefixed("license.removed",
                    "player", target.getName(), "license", licenseId));
        } else {
            sender.sendMessage(messages.prefixed("license.remove-failed",
                    "player", target.getName(), "license", licenseId));
        }
    }

    /** Forces a licence to lapse now. A testing and moderation tool. */
    private void expire(CommandSender sender, String[] args) {
        if (!allowed(sender, ADMIN)) {
            return;
        }

        if (args.length < 2) {
            sender.sendMessage(messages.prefixed("license.usage-expire"));
            return;
        }

        Player target = sender.getServer().getPlayerExact(args[0]);

        if (target == null) {
            sender.sendMessage(messages.prefixed("license.player-offline", "player", args[0]));
            return;
        }

        if (licenses.expire(target, args[1])) {
            sender.sendMessage(messages.prefixed("license.expired-now",
                    "player", target.getName(), "license", args[1]));
        } else {
            sender.sendMessage(messages.prefixed("license.expire-failed",
                    "player", target.getName(), "license", args[1]));
        }
    }

    // ─── NPC verbs ────────────────────────────────────────────────────────────────────────────

    private void setNpc(CommandSender sender) {
        if (!allowed(sender, ADMIN)) {
            return;
        }

        Optional<LicenseNpcHook> hook = citizens.get();

        if (hook.isEmpty()) {
            sender.sendMessage(messages.prefixed("license.no-citizens"));
            return;
        }

        Optional<Integer> selected = hook.get().selectedNpc(sender);

        if (selected.isEmpty()) {
            sender.sendMessage(messages.prefixed("license.no-npc-selected"));
            return;
        }

        int npcId = selected.get();
        String name = hook.get().nameOf(npcId).orElse("#" + npcId);

        if (npcs.add(npcId)) {
            sender.sendMessage(messages.prefixed("license.npc-set", "npc", name));
        } else {
            sender.sendMessage(messages.prefixed("license.npc-already", "npc", name));
        }
    }

    private void removeNpc(CommandSender sender) {
        if (!allowed(sender, ADMIN)) {
            return;
        }

        Optional<LicenseNpcHook> hook = citizens.get();

        if (hook.isEmpty()) {
            sender.sendMessage(messages.prefixed("license.no-citizens"));
            return;
        }

        Optional<Integer> selected = hook.get().selectedNpc(sender);

        if (selected.isEmpty()) {
            sender.sendMessage(messages.prefixed("license.no-npc-selected"));
            return;
        }

        String name = hook.get().nameOf(selected.get()).orElse("#" + selected.get());

        if (npcs.remove(selected.get())) {
            sender.sendMessage(messages.prefixed("license.npc-removed", "npc", name));
        } else {
            sender.sendMessage(messages.prefixed("license.npc-not-set", "npc", name));
        }
    }

    /** What the system currently believes, for diagnosing a setup that is not behaving. */
    private void debug(CommandSender sender) {
        if (!allowed(sender, ADMIN)) {
            return;
        }

        sender.sendMessage(messages.prefixed("license.debug-header"));

        sender.sendMessage(messages.component("license.debug-line",
                "text", "licences registered: " + licenses.all().size()));
        sender.sendMessage(messages.component("license.debug-line",
                "text", "categories: " + licenses.registry().categories().size()));
        sender.sendMessage(messages.component("license.debug-line",
                "text", "economy: " + (licenses.economy().available() ? "available" : "UNAVAILABLE")));
        sender.sendMessage(messages.component("license.debug-line",
                "text", "citizens: " + (citizens.get().isPresent() ? "hooked" : "not installed")));
        sender.sendMessage(messages.component("license.debug-line",
                "text", "licence NPCs: " + npcs.size()));

        citizens.get().ifPresent(hook -> hook.forEachLive(line ->
                sender.sendMessage(messages.component("license.debug-line", "text", "  " + line))));

        if (sender instanceof Player player) {
            sender.sendMessage(messages.component("license.debug-line",
                    "text", "you hold: " + licenses.heldIds(player)));
        }
    }

    // ─── Shared ───────────────────────────────────────────────────────────────────────────────

    private boolean allowed(CommandSender sender, String permission) {
        if (sender.hasPermission(permission)) {
            return true;
        }

        sender.sendMessage(messages.prefixed("license.no-permission"));
        return false;
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                      @NotNull String alias, String[] args) {

        if (args.length == 1) {
            return filter(VERBS, args[0]);
        }

        String verb = args[0].toLowerCase(Locale.ROOT);

        // Second argument: a player for the verbs that name one, a licence id for the rest.
        if (args.length == 2) {
            return switch (verb) {
                case "give", "remove", "expire", "check" -> filter(onlinePlayers(sender), args[1]);
                case "info", "renew" -> filter(licenseIds(), args[1]);
                default -> List.of();
            };
        }

        // Third argument is a licence id for the verbs whose second was a player.
        if (args.length == 3 && (verb.equals("give") || verb.equals("remove") || verb.equals("expire"))) {
            return filter(licenseIds(), args[2]);
        }

        return List.of();
    }

    private List<String> licenseIds() {
        return licenses.all().stream().map(License::id).toList();
    }

    private List<String> onlinePlayers(CommandSender sender) {
        List<String> names = new ArrayList<>();
        sender.getServer().getOnlinePlayers().forEach(player -> names.add(player.getName()));
        return names;
    }

    private static List<String> filter(List<String> options, String prefix) {
        String lower = prefix.toLowerCase(Locale.ROOT);

        return options.stream().filter(option -> option.toLowerCase(Locale.ROOT).startsWith(lower)).toList();
    }
}
