package org.robtic.auth;

import io.papermc.paper.connection.PlayerCommonConnection;
import io.papermc.paper.connection.PlayerConfigurationConnection;
import io.papermc.paper.dialog.Dialog;
import io.papermc.paper.event.connection.configuration.AsyncPlayerConnectionConfigureEvent;
import io.papermc.paper.event.player.PlayerCustomClickEvent;
import io.papermc.paper.registry.data.dialog.ActionButton;
import io.papermc.paper.registry.data.dialog.DialogBase;
import io.papermc.paper.registry.data.dialog.action.DialogAction;
import io.papermc.paper.registry.data.dialog.body.DialogBody;
import io.papermc.paper.registry.data.dialog.input.DialogInput;
import io.papermc.paper.registry.data.dialog.type.DialogType;
import net.kyori.adventure.audience.Audience;
import net.kyori.adventure.key.Key;
import net.kyori.adventure.nbt.api.BinaryTagHolder;
import net.kyori.adventure.text.Component;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Asks for the password before the player enters the world.
 *
 * <h2>Why this exists</h2>
 *
 * The in-world flow has to <em>contain</em> an unauthenticated player: a link world to hold them, a
 * dozen cancelled events so they cannot act, a visibility pass so nobody sees them, and a task to
 * kick them if they wander off. All of it is scaffolding around a player who should not be there
 * yet.
 *
 * Paper's configuration phase is the moment after the client has connected and before it has loaded
 * a world, and {@link AsyncPlayerConnectionConfigureEvent} blocks the connection until its handlers
 * return. A password taken here is taken from somebody who is not in the world at all — so none of
 * that scaffolding applies to them, and a returning player with a live session simply joins.
 *
 * <h2>Who this does not serve</h2>
 *
 * <ul>
 *   <li><b>Bedrock.</b> Geyser cannot render a Java dialog. A Bedrock player shown one sees nothing
 *       and would sit here until the timeout disconnected them — a hard lockout for every Bedrock
 *       player on the server. They are detected by their Floodgate UUID and passed straight
 *       through to the in-world flow.</li>
 *   <li><b>Anyone who must visit Discord.</b> A new player linking, or a legacy account setting its
 *       first password, needs minutes and another device. Holding a connection open for that is
 *       worse than letting them wait in the link world, so they are passed through too.</li>
 * </ul>
 *
 * <h2>The session is the handoff</h2>
 *
 * Nothing is shared with the in-world path. A successful login here creates a session through the
 * ordinary API route, and when the player then joins, {@link AuthService#resolve} reads that session
 * back and finds them authenticated. Two phases, one source of truth, no state to keep in step.
 */
public final class AuthConfigurationListener implements Listener {

    /** Button identifiers. Namespaced, because the response arrives as an event rather than a callback. */
    private static final Key LOGIN = Key.key("robtic", "auth_prejoin_login");
    private static final Key FORGOT = Key.key("robtic", "auth_prejoin_forgot");

    private static final String PASSWORD_KEY = "password";
    private static final int PASSWORD_MAX_LENGTH = 128;

    /**
     * The payload carried by a button press. Empty, because the identity is in the key.
     *
     * An empty compound rather than null on purpose. The sibling overload of {@code customClick} —
     * the one taking a callback — dereferences its second argument and throws out of dialog
     * construction when it is null, which the player sees as no screen at all. Nothing here reads
     * the tag, so an empty one costs nothing and removes a way to reproduce that bug.
     */
    private static final BinaryTagHolder NO_PAYLOAD = BinaryTagHolder.binaryTagHolder("{}");

    private final Plugin plugin;
    private final AuthService auth;
    private final MessageCatalog messages;

    /** Connections currently held at the dialog, keyed by the profile they connected with. */
    private final Map<UUID, Pending> pending = new ConcurrentHashMap<>();

    private record Pending(
            CompletableFuture<Boolean> gate,
            PlayerConfigurationConnection connection,
            String username,
            String address
    ) {
    }

    public AuthConfigurationListener(Plugin plugin, AuthService auth, MessageCatalog messages) {
        this.plugin = plugin;
        this.auth = auth;
        this.messages = messages;
    }

    /**
     * Holds the connection while the password is answered.
     *
     * Runs on Paper's configuration thread — not the main thread and not a Bukkit worker — which is
     * why the API calls below are the blocking variants. Blocking here is the mechanism, not a
     * mistake: the connection is meant to wait.
     */
    @EventHandler(priority = EventPriority.NORMAL)
    public void onConfigure(AsyncPlayerConnectionConfigureEvent event) {
        AuthSettings settings = auth.settings();

        if (!settings.enabled() || !settings.preJoinLogin()) {
            return;
        }

        PlayerConfigurationConnection connection = event.getConnection();
        UUID uuid = connection.getProfile().getId();
        String username = connection.getProfile().getName();

        if (uuid == null || username == null) {
            return;
        }

        // Bedrock cannot see a dialog. Passing them through is not a compromise — the in-world flow
        // is their supported path, and holding them here would lock them out entirely.
        if (uuid.getMostSignificantBits() == 0L) {
            return;
        }

        String address = addressOf(connection);
        AuthState state = auth.readStateBlocking(uuid, username, address);

        if (state == null) {
            // The API could not be reached. Refused rather than admitted: an outage must not be a
            // way past authentication, and letting them in unauthenticated would put them in the
            // world with the in-world flow also unable to check anything.
            connection.disconnect(messages.component("auth.prejoin-unavailable"));
            return;
        }

        // A live session was accepted by the state read itself. They never see a prompt.
        if (state.authenticated()) {
            return;
        }

        // Linking, or setting a first password, needs Discord and another device. The link world is
        // a better place to wait than a held connection.
        if (state.outcome() != AuthState.Outcome.NEEDS_LOGIN) {
            return;
        }

        hold(connection, uuid, username, address, settings);
    }

    /** Shows the dialog and blocks until it is answered, times out, or the connection drops. */
    private void hold(
            PlayerConfigurationConnection connection,
            UUID uuid,
            String username,
            String address,
            AuthSettings settings
    ) {
        CompletableFuture<Boolean> gate = new CompletableFuture<>();
        pending.put(uuid, new Pending(gate, connection, username, address));

        try {
            connection.getAudience().showDialog(loginDialog(null));

            // Bounded on purpose. This thread belongs to the connection, and an unbounded wait
            // would hold it for as long as an abandoned client stayed open.
            boolean authenticated = gate
                    .completeOnTimeout(false, settings.preJoinTimeoutSeconds(), TimeUnit.SECONDS)
                    .join();

            if (!authenticated) {
                connection.disconnect(messages.component("auth.prejoin-timeout"));
            }
        } catch (RuntimeException error) {
            // A dialog that failed to build would otherwise leave the connection hanging until the
            // timeout with nothing in the log to explain it.
            plugin.getLogger().log(java.util.logging.Level.SEVERE,
                    "The pre-join login dialog failed for " + username
                            + " — letting them through to the in-world flow instead.", error);
        } finally {
            pending.remove(uuid);
        }
    }

    /**
     * Handles a button press on the pre-join dialog.
     *
     * Fires on the main thread, so nothing here blocks: the API call is handed to a worker, and the
     * configuration thread waiting on the future is released from there.
     */
    @EventHandler(priority = EventPriority.NORMAL)
    public void onClick(PlayerCustomClickEvent event) {
        Key identifier = event.getIdentifier();

        if (!LOGIN.equals(identifier) && !FORGOT.equals(identifier)) {
            return;
        }

        PlayerCommonConnection common = event.getCommonConnection();
        if (!(common instanceof PlayerConfigurationConnection connection)) {
            return;
        }

        UUID uuid = connection.getProfile().getId();
        Pending held = uuid == null ? null : pending.get(uuid);

        if (held == null) {
            return;
        }

        if (FORGOT.equals(identifier)) {
            plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> forgot(held, uuid));
            return;
        }

        String typed = event.getDialogResponseView().getText(PASSWORD_KEY);
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> submit(held, uuid, typed));
    }

    private void submit(Pending held, UUID uuid, String typed) {
        if (typed == null || typed.isBlank()) {
            reshow(held, "auth.empty-password");
            return;
        }

        AuthService.LoginResult result =
                auth.loginBlocking(uuid, held.username(), typed.trim(), held.address());

        if (result.ok()) {
            // Released: the configuration thread stops waiting and the player enters the world. The
            // session the API just created is what the in-world flow will read on join.
            held.gate().complete(true);
            return;
        }

        if (result.rateLimited()) {
            held.connection().disconnect(messages.component("auth.rate-limited",
                    "minutes", String.valueOf(Math.max(1, result.retryAfterMs() / 60_000L))));
            held.gate().complete(false);
            return;
        }

        // An administrator cleared the password between the state read and now. Letting them through
        // hands them to the in-world flow, which offers the setup screen.
        if (result.needsPassword()) {
            held.gate().complete(true);
            return;
        }

        reshow(held, result.attemptsRemaining() < 0
                ? "auth.wrong-password-unknown"
                : "auth.wrong-password-remaining",
                String.valueOf(Math.max(0, result.attemptsRemaining())));
    }

    /**
     * Issues a recovery code and disconnects with it.
     *
     * Deliberately not a "wait here while you fix it" flow: setting a new password means opening
     * Discord on another device, and a connection held open for that would time out. The code
     * travels in the disconnect screen, which stays on screen for as long as they need it.
     */
    private void forgot(Pending held, UUID uuid) {
        Component message = auth.requestRecoveryBlocking(uuid, held.username())
                .map(code -> messages.component("auth.prejoin-recovery",
                        "code", code.code(),
                        "minutes", String.valueOf(code.minutesValid())))
                .orElseGet(() -> messages.component("auth.prejoin-unavailable"));

        held.connection().disconnect(message);
        held.gate().complete(false);
    }

    /** Re-opens the dialog with an error line on it. */
    private void reshow(Pending held, String messageKey, Object... placeholders) {
        Audience audience = held.connection().getAudience();
        audience.showDialog(loginDialog(messages.component(messageKey, placeholders)));
    }

    /**
     * Releases a connection that dropped while being asked.
     *
     * Without this the configuration thread would sit on the future until the timeout elapsed, for a
     * client that is already gone.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onClose(com.destroystokyo.paper.event.player.PlayerConnectionCloseEvent event) {
        Pending held = pending.remove(event.getPlayerUniqueId());

        if (held != null) {
            held.gate().complete(false);
        }
    }

    // ─── The dialog ───────────────────────────────────────────────────────────────────────────

    /**
     * The login screen, as a dialog whose buttons report by key rather than by callback.
     *
     * The callback form of {@code customClick} delivers to an {@code Audience}; during configuration
     * there is no Player behind it, so the response is taken from {@link PlayerCustomClickEvent}
     * instead — which is the form Paper documents for this phase.
     *
     * @param error a line to show above the field, or null on the first showing
     */
    private Dialog loginDialog(Component error) {
        List<DialogBody> body = new java.util.ArrayList<>();
        body.add(DialogBody.plainMessage(messages.component("auth.dialog-login-body")));

        if (error != null) {
            body.add(DialogBody.plainMessage(error));
        }

        return Dialog.create(builder -> builder.empty()
                .base(DialogBase.builder(messages.component("auth.dialog-login-title"))
                        .body(List.copyOf(body))
                        .inputs(List.of(DialogInput
                                .text(PASSWORD_KEY, messages.component("auth.dialog-login-field"))
                                .maxLength(PASSWORD_MAX_LENGTH)
                                .build()))
                        // There is nowhere else to go from here: the player is not in a world, and
                        // dismissing this would leave them connected to nothing.
                        .canCloseWithEscape(false)
                        .afterAction(DialogBase.DialogAfterAction.NONE)
                        .build())
                .type(DialogType.confirmation(
                        ActionButton.builder(messages.component("auth.dialog-login-button"))
                                .action(DialogAction.customClick(LOGIN, NO_PAYLOAD))
                                .build(),
                        ActionButton.builder(messages.component("auth.dialog-forgot-button"))
                                .tooltip(messages.component("auth.dialog-forgot-tooltip"))
                                .action(DialogAction.customClick(FORGOT, NO_PAYLOAD))
                                .build())));
    }

    private static String addressOf(PlayerConfigurationConnection connection) {
        java.net.InetSocketAddress socket = connection.getClientAddress();
        return socket == null || socket.getAddress() == null
                ? null
                : socket.getAddress().getHostAddress();
    }
}
