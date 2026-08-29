package org.robtic.minecraft.auth;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Chooses how to ask a given player to authenticate, and remembers what it chose.
 *
 * <h2>Ordered, with a guaranteed last resort</h2>
 *
 * Surfaces are tried in the order they were registered and the first that says it supports the
 * player wins. The inventory surface is registered last and supports everybody, so the loop cannot
 * fall off the end — a player who could not be prompted would be restricted with no way out, which
 * is the one failure this whole subsystem must not produce.
 *
 * <h2>The choice is per player, not per server</h2>
 *
 * Java, Bedrock through Geyser, and mobile clients reach the same server at the same time. Deciding
 * once at startup would give all of them whichever surface the first player happened to justify.
 *
 * <h2>Shown once, never on a loop</h2>
 *
 * This class shows a prompt when something asks it to and does nothing on its own. There is no timer
 * and no reopen-on-close, because the previous build had one and it produced a deadlock: the
 * instruction screen told players to run {@code /link} and reopened itself the instant they closed
 * it to reach chat.
 *
 * A prompt that needs re-showing after a wrong password is re-shown by the surface that collected
 * it, which is the only party that knows the attempt failed.
 */
public final class AuthPromptRouter {

    private final Plugin plugin;
    private final List<AuthPrompt> prompts = new ArrayList<>();

    /** Which surface each player was given, so a re-prompt after a wrong password is consistent. */
    private final Map<UUID, AuthPrompt> chosen = new ConcurrentHashMap<>();

    public AuthPromptRouter(Plugin plugin) {
        this.plugin = plugin;
    }

    /**
     * Adds a surface. Order matters: the first that supports a player is used.
     *
     * The fallback must be registered last, and it is the caller's job to register one — see
     * {@link #show}, which logs loudly rather than silently doing nothing if none matched.
     */
    public AuthPromptRouter register(AuthPrompt prompt) {
        prompts.add(prompt);
        return this;
    }

    /** Prompts the player on whichever surface suits them. Main thread only. */
    public void show(Player player) {
        AuthPrompt prompt = chosen.computeIfAbsent(player.getUniqueId(), uuid -> resolve(player));

        if (prompt == null) {
            // Only reachable if no fallback was registered, which is a wiring mistake rather than a
            // runtime condition. Said plainly, because the symptom — a player stuck and restricted
            // with no menu — gives an operator nothing to go on.
            plugin.getLogger().severe("No authentication prompt supports " + player.getName()
                    + ", so they cannot log in. This is a configuration or wiring fault: at least one "
                    + "prompt must support every player.");
            return;
        }

        try {
            prompt.show(player);
        } catch (RuntimeException | LinkageError error) {
            // A prompt that throws while building leaves the player staring at nothing, and Bukkit
            // swallows the trace into a scheduler log nobody is watching. Named here, with the
            // player and the surface, because "the login screen did not appear" is otherwise the
            // least diagnosable failure this plugin has.
            plugin.getLogger().log(java.util.logging.Level.SEVERE,
                    "The " + prompt.name() + " prompt failed to open for " + player.getName()
                            + " — they are restricted with no way to log in.", error);

            // Fall through to the next surface that supports them. A broken dialog must not be the
            // end of the road when a chat prompt would have worked.
            fallBack(player, prompt);
        }
    }

    /**
     * Retries on the next surface after one fails outright.
     *
     * The failed surface is remembered as unusable for this player, so the fallback sticks rather
     * than being re-chosen on the next re-show and failing identically.
     */
    private void fallBack(Player player, AuthPrompt failed) {
        for (AuthPrompt candidate : prompts) {
            if (candidate == failed || !candidate.supports(player)) {
                continue;
            }

            chosen.put(player.getUniqueId(), candidate);

            try {
                candidate.show(player);
                plugin.getLogger().warning("Fell back to the " + candidate.name()
                        + " prompt for " + player.getName() + ".");
            } catch (RuntimeException | LinkageError alsoFailed) {
                plugin.getLogger().log(java.util.logging.Level.SEVERE,
                        "The " + candidate.name() + " fallback also failed for " + player.getName(),
                        alsoFailed);
            }

            return;
        }
    }

    public void forget(UUID uuid) {
        chosen.remove(uuid);
    }

    private AuthPrompt resolve(Player player) {
        for (AuthPrompt prompt : prompts) {
            if (prompt.supports(player)) {
                plugin.getLogger().fine("Authenticating " + player.getName() + " via " + prompt.name());
                return prompt;
            }
        }

        return null;
    }
}
