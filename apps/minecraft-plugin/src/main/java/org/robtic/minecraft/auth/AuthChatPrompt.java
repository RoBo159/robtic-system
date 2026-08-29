package org.robtic.minecraft.auth;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.config.MessageCatalog;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The last-resort login surface: the player types their password into chat.
 *
 * <h2>Why this, and not an inventory GUI</h2>
 *
 * An inventory cannot accept text. The only text-capable containers Minecraft has are the anvil's
 * rename box — removed from this plugin deliberately — and the sign editor. A chest or hopper menu
 * physically cannot take a password, so "fall back to an inventory GUI" is not an option that
 * exists for a login screen; it could only ever be a menu that launches something else.
 *
 * Chat capture is what AuthMe has always done, so it is the one fallback every player already
 * recognises. It has no slots, nothing draggable, no rename mechanics and no fake container — which
 * satisfies the constraints on the login UX better than an inventory would have.
 *
 * <h2>The typed line never reaches anybody</h2>
 *
 * {@link AuthChatListener} runs at {@code LOWEST} and cancels the event before any other plugin
 * sees it, so a password is never broadcast, never logged by a chat plugin and never relayed to
 * Discord. The capture is armed per player and cleared the moment it is consumed.
 *
 * <h2>Reached only when nothing better exists</h2>
 *
 * Java clients get a dialog and Bedrock clients get a native form. This is for a server older than
 * Paper 1.21.7, or a Bedrock player on a server without Floodgate.
 */
public final class AuthChatPrompt implements AuthPrompt {

    /** What the next chat line from this player will be taken to mean. */
    enum Expecting {
        PASSWORD
    }

    private final Plugin plugin;
    private final AuthService auth;
    private final MessageCatalog messages;

    /** Players whose next chat line is a password rather than a message. */
    private final Map<UUID, Expecting> armed = new ConcurrentHashMap<>();

    public AuthChatPrompt(Plugin plugin, AuthService auth, MessageCatalog messages) {
        this.plugin = plugin;
        this.auth = auth;
        this.messages = messages;
    }

    /** Always. This is the floor of the chain, and a floor that can decline is not one. */
    @Override
    public boolean supports(Player player) {
        return true;
    }

    @Override
    public String name() {
        return "chat";
    }

    @Override
    public void show(Player player) {
        AuthState state = auth.stateOf(player.getUniqueId()).orElse(null);
        if (state == null || state.authenticated()) {
            return;
        }

        switch (state.outcome()) {
            case NEEDS_LINK -> instructions(player);
            case NEEDS_PASSWORD -> completeSetup(player);
            default -> askForPassword(player);
        }
    }

    /**
     * The unlinked player's instructions.
     *
     * Nothing is armed and nothing blocks: they read this, and their next action is `/link`, which
     * is offered as a clickable line so it does not have to be typed.
     */
    private void instructions(Player player) {
        for (Component line : messages.lines("auth.chat-link")) {
            player.sendMessage(line);
        }

        player.sendMessage(messages.component("auth.chat-link-button")
                .clickEvent(ClickEvent.runCommand("/link"))
                .hoverEvent(messages.component("auth.dialog-link-tooltip")));
    }

    /**
     * The legacy account screen: linked before passwords existed.
     *
     * Offered as a clickable line rather than armed input, because the player has nothing to type —
     * pressing it asks the API for a recovery code, exactly as the dialog's button does.
     */
    private void completeSetup(Player player) {
        AuthService.RecoveryCode held = auth.heldCode(player.getUniqueId());

        if (held != null) {
            showSetup(player, held);
            return;
        }

        // Printed before the request, not after it.
        //
        // This used to fetch the code first and print nothing at all if the request failed, which
        // left a legacy player with no message, no prompt and no idea what to do. The instructions
        // do not depend on the network, so they are shown regardless and the code follows.
        for (Component line : messages.lines("auth.chat-setup-intro")) {
            player.sendMessage(line);
        }

        armed.put(player.getUniqueId(), Expecting.PASSWORD);

        auth.requestRecovery(player, issued -> issued.ifPresent(code -> showSetup(player, code)));
    }

    /** Prints the setup code and the steps that go with it. */
    private void showSetup(Player player, AuthService.RecoveryCode code) {
        for (Component line : messages.lines("auth.chat-setup",
                "code", code.code(),
                "minutes", String.valueOf(code.minutesValid()))) {
            player.sendMessage(line);
        }

        // Armed throughout: the next thing they type, once they are back from Discord, is the
        // password they just set.
        armed.put(player.getUniqueId(), Expecting.PASSWORD);
    }

    /** Arms the capture and tells the player what to do. */
    private void askForPassword(Player player) {
        armed.put(player.getUniqueId(), Expecting.PASSWORD);

        for (Component line : messages.lines("auth.chat-login")) {
            player.sendMessage(line);
        }

        player.sendMessage(messages.component("auth.chat-forgot-button")
                .clickEvent(ClickEvent.callback(audience -> sendRecoveryCode(player))));
    }

    /**
     * Asks for a code and prints it once.
     *
     * The capture is left armed throughout: the next thing the player types, once they are back from
     * Discord, is the new password. Disarming would leave them typing it into open chat.
     */
    private void sendRecoveryCode(Player player) {
        auth.requestRecovery(player, issued -> issued.ifPresent(code -> {
            for (Component line : messages.lines("auth.recovery-issued",
                    "code", code.code(),
                    "minutes", String.valueOf(code.minutesValid()))) {
                player.sendMessage(line);
            }

            armed.put(player.getUniqueId(), Expecting.PASSWORD);
        }));
    }

    /** Whether this player's next chat line should be consumed as a password. */
    boolean isArmed(UUID uuid) {
        return armed.containsKey(uuid);
    }

    /**
     * Consumes a captured line. Called from the listener, off the main thread.
     *
     * @return true when the line was taken as a password and must not be broadcast
     */
    boolean consume(Player player, String line) {
        if (armed.remove(player.getUniqueId()) == null) {
            return false;
        }

        String password = line.trim();

        // Back to the main thread: chat arrives asynchronously, and everything below leads to a
        // teleport and an event.
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            if (!player.isOnline()) {
                return;
            }

            if (password.isEmpty()) {
                show(player);
                return;
            }

            auth.login(player, password, result -> {
                if (result.ok()) {
                    return;
                }

                if (result.rateLimited()) {
                    player.sendMessage(messages.prefixed("auth.rate-limited",
                            "minutes", String.valueOf(Math.max(1, result.retryAfterMs() / 60_000L))));
                } else if (!result.needsPassword()) {
                    player.sendMessage(messages.prefixed("auth.wrong-password",
                            "attempts", result.attemptsRemaining() < 0
                                    ? "?"
                                    : String.valueOf(result.attemptsRemaining())));
                }

                show(player);
            });
        });

        return true;
    }

    public void forget(UUID uuid) {
        armed.remove(uuid);
    }
}
