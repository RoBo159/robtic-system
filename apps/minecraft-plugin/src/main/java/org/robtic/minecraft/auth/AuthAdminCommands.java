package org.robtic.minecraft.auth;

import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.util.Durations;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * `/auth` — the administrative side of RobticAuth.
 *
 * <pre>
 *   /auth forcelink &lt;player&gt; &lt;discordId&gt;   link an account by hand
 *   /auth forceunlink &lt;player&gt;             remove a link, its password and its sessions
 *   /auth resetpassword &lt;player&gt;           clear the password so they can set a new one
 *   /auth resetsession &lt;player&gt;            sign them out everywhere
 *   /auth sessions &lt;player&gt;                list their live sessions
 * </pre>
 *
 * Structured with verbs under one command, as `/afk` and `/staff` are, so the whole feature is
 * discoverable from `/auth` rather than spread across five names nobody can guess.
 *
 * <h2>Offline players are the point, not an edge case</h2>
 *
 * The rest of this plugin's staff commands take an online target, which is right for freezing and
 * jailing — you act on somebody who is doing something. Authentication is the opposite: the player
 * who needs their password reset is by definition the one who cannot get in. So this resolves
 * against the server's known-player cache as well as the online list.
 *
 * It deliberately does *not* fall back to a Mojang lookup. That is a blocking network call on the
 * main thread, and it would resolve names this server has never seen — inviting a typo to create a
 * link for a stranger's account.
 */
public final class AuthAdminCommands implements CommandExecutor, TabCompleter {

    private static final List<String> VERBS =
            List.of("forcelink", "forceunlink", "resetpassword", "resetsession", "sessions");

    /** Verb → the action name the API knows it by. */
    private static String actionFor(String verb) {
        return switch (verb) {
            case "forcelink" -> "force_link";
            case "forceunlink" -> "force_unlink";
            case "resetpassword" -> "reset_password";
            case "resetsession" -> "reset_session";
            case "sessions" -> "list_sessions";
            default -> null;
        };
    }

    private final AuthService auth;
    private final MessageCatalog messages;

    public AuthAdminCommands(AuthService auth, MessageCatalog messages) {
        this.auth = auth;
        this.messages = messages;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {
        if (args.length < 2) {
            sender.sendMessage(messages.prefixed("auth.admin-usage"));
            return true;
        }

        String verb = args[0].toLowerCase(Locale.ROOT);
        String action = actionFor(verb);

        if (action == null) {
            sender.sendMessage(messages.prefixed("auth.admin-usage"));
            return true;
        }

        Optional<Target> target = resolve(args[1]);
        if (target.isEmpty()) {
            sender.sendMessage(messages.prefixed("auth.admin-unknown-player", "player", args[1]));
            return true;
        }

        String discordId = null;

        if (verb.equals("forcelink")) {
            if (args.length < 3) {
                sender.sendMessage(messages.prefixed("auth.admin-forcelink-usage"));
                return true;
            }

            discordId = args[2].trim();

            // Checked here rather than left to the API purely so the operator gets the mistake back
            // immediately: a mistyped snowflake is by far the likeliest thing to go wrong with this
            // command, and a round trip to be told "validation failed" helps nobody.
            if (!discordId.matches("\\d{15,25}")) {
                sender.sendMessage(messages.prefixed("auth.admin-bad-discord-id", "value", discordId));
                return true;
            }
        }

        auth.admin(sender, action, target.get().uuid(), target.get().username(), discordId, result ->
                result.ifPresent(outcome -> report(sender, outcome)));

        return true;
    }

    /** Renders what happened. `sessions` prints a list; everything else is one line. */
    private void report(CommandSender sender, AuthService.AdminResult result) {
        sender.sendMessage(messages.prefixed("auth.admin-done", "summary", result.summary()));

        for (AuthService.SessionSummary session : result.sessions()) {
            sender.sendMessage(messages.component("auth.admin-session",
                    "server", session.serverId(),
                    "expires", Durations.compact(Math.max(0L, session.expiresAt() - System.currentTimeMillis())),
                    "seen", Durations.compact(Math.max(0L, System.currentTimeMillis() - session.lastLoginAt()))));
        }
    }

    /** A resolved target: online first, then anybody this server has seen before. */
    private record Target(UUID uuid, String username) {
    }

    private Optional<Target> resolve(String name) {
        Player online = Bukkit.getPlayerExact(name);
        if (online != null) {
            return Optional.of(new Target(online.getUniqueId(), online.getName()));
        }

        // Paper's cached lookup: it answers from the server's own player data and never touches the
        // network, so it is safe on the main thread and cannot resolve a name nobody here has used.
        OfflinePlayer known = Bukkit.getOfflinePlayerIfCached(name);
        if (known != null && known.getName() != null) {
            return Optional.of(new Target(known.getUniqueId(), known.getName()));
        }

        return Optional.empty();
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                      @NotNull String label, String[] args) {
        if (args.length == 1) {
            String prefix = args[0].toLowerCase(Locale.ROOT);
            return VERBS.stream().filter(verb -> verb.startsWith(prefix)).toList();
        }

        if (args.length == 2) {
            String prefix = args[1].toLowerCase(Locale.ROOT);
            List<String> names = new ArrayList<>();

            for (Player player : Bukkit.getOnlinePlayers()) {
                if (player.getName().toLowerCase(Locale.ROOT).startsWith(prefix)) {
                    names.add(player.getName());
                }
            }

            return names;
        }

        // No completion for the Discord id. There is nothing sensible to suggest, and suggesting
        // the ids of people who happen to be linked would be handing out account identifiers.
        return List.of();
    }
}
