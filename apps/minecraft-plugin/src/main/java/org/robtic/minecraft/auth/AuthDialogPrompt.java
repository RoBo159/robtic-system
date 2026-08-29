package org.robtic.minecraft.auth;

import io.papermc.paper.dialog.Dialog;
import io.papermc.paper.registry.data.dialog.ActionButton;
import io.papermc.paper.registry.data.dialog.DialogBase;
import io.papermc.paper.registry.data.dialog.action.DialogAction;
import io.papermc.paper.registry.data.dialog.body.DialogBody;
import io.papermc.paper.registry.data.dialog.input.DialogInput;
import io.papermc.paper.registry.data.dialog.type.DialogType;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickCallback;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.config.MessageCatalog;

import java.time.Duration;
import java.util.List;

/**
 * The Paper Dialog login surface — a real client dialog, and the primary experience on Java.
 *
 * <h2>Why this replaced the anvil</h2>
 *
 * An anvil is an inventory pretending to be a form: it has slots, items can be dragged out of it,
 * and the text box is a rename field whose contents are attached to an item. It reads as a bug even
 * when it works. A dialog is what the client already uses for its own prompts — a title, a body, a
 * text field and buttons — so it looks like part of the game rather than a workaround.
 *
 * <h2>Modal, but never a trap</h2>
 *
 * The login and setup screens set {@code canCloseWithEscape(false)}, because an unauthenticated
 * player has nothing else to do and a dismissed login screen would leave them stuck.
 *
 * The instructions screen does the opposite: it closes freely and is never reopened automatically.
 * The rule the earlier build broke is that <em>a modal screen must contain every action it asks
 * for</em>. Instructions that say "run /link" while blocking the chat box are a deadlock; a login
 * dialog with the password field inside it is not.
 *
 * The instruction screen goes further and carries the action itself — its button runs {@code /link}
 * on the player's behalf, so nobody has to type anything at all.
 */
public final class AuthDialogPrompt implements AuthPrompt {

    private static final int PASSWORD_MAX_LENGTH = 128;

    /**
     * How every button on these dialogs is registered.
     *
     * <h2>Not optional, and not defaultable</h2>
     *
     * {@code DialogAction.customClick(callback, options)} dereferences the options immediately —
     * passing null throws a {@link NullPointerException} out of dialog construction, which the
     * player experiences as no screen at all.
     *
     * <h2>Unlimited uses, deliberately</h2>
     *
     * Adventure defaults a callback to <em>one</em> use. On a login screen that is precisely wrong:
     * the first mistyped password would consume the button and leave the player with a dialog whose
     * Login does nothing. Attempts are already bounded where it matters — by the API's per-account
     * rate limit — so the button itself must not be.
     *
     * The lifetime outlives any plausible login. A player who leaves the screen open through a meal
     * should not come back to a dead button.
     */
    private static final ClickCallback.Options BUTTON_OPTIONS = ClickCallback.Options.builder()
            .uses(ClickCallback.UNLIMITED_USES)
            .lifetime(Duration.ofHours(6))
            .build();

    /** The key the password field is read back by. Local to this class; never leaves it. */
    private static final String PASSWORD_KEY = "password";

    private final Plugin plugin;
    private final AuthService auth;
    private final AuthPlatform platform;
    private final MessageCatalog messages;

    public AuthDialogPrompt(Plugin plugin, AuthService auth, AuthPlatform platform, MessageCatalog messages) {
        this.plugin = plugin;
        this.auth = auth;
        this.platform = platform;
        this.messages = messages;
    }

    /**
     * Java clients on a server new enough to have the API.
     *
     * Bedrock is excluded explicitly: Geyser cannot render a Java dialog, and a player shown one
     * would see nothing at all — the worst possible failure, because it is invisible.
     */
    @Override
    public boolean supports(Player player) {
        return platform.supportsDialogs() && !platform.isBedrock(player);
    }

    @Override
    public String name() {
        return "dialog";
    }

    @Override
    public void show(Player player) {
        AuthState state = auth.stateOf(player.getUniqueId()).orElse(null);
        if (state == null || state.authenticated()) {
            return;
        }

        switch (state.outcome()) {
            case NEEDS_LINK -> player.showDialog(instructions());
            // Drawn immediately, with whatever code the player already holds — which is none on the
            // first showing. It used to wait for the API to issue one before drawing anything, so a
            // failed request meant no screen at all: a legacy player saw nothing and had no way to
            // act. Nothing that renders a screen may depend on a network call succeeding.
            case NEEDS_PASSWORD -> player.showDialog(completeSetup(auth.heldCode(player.getUniqueId())));
            default -> player.showDialog(login(state));
        }
    }

    /**
     * Builds every screen once, at startup, and reports any that cannot be constructed.
     *
     * <h2>Why this exists</h2>
     *
     * The Dialog API validates aggressively at construction time, and three separate mistakes here
     * — a null callback options, a single-use button, a command template with nothing to template —
     * each compiled cleanly and each threw only when a real player reached that particular screen.
     * The symptom every time was a player with no screen and no way to log in, which is the worst
     * failure this plugin can produce and the one least likely to be noticed in testing.
     *
     * Constructing them at boot moves that discovery from "a player is stuck" to a line in the
     * console before anybody connects. Nothing is shown to anyone; the dialogs are built and
     * discarded.
     *
     * @return true when every screen built
     */
    public boolean selfTest() {
        AuthState sample = AuthState.unavailable(null);
        AuthService.RecoveryCode code = new AuthService.RecoveryCode("TEST-CODE", 10, null, System.currentTimeMillis());

        record Screen(String name, java.util.function.Supplier<Dialog> build) {
        }

        List<Screen> screens = List.of(
                new Screen("link instructions", this::instructions),
                new Screen("create password (no code yet)", () -> completeSetup(null)),
                new Screen("create password (with code)", () -> completeSetup(code)),
                new Screen("login", () -> login(sample)),
                new Screen("login (rate limited)", () -> login(sample.withRetryAfter(60_000L))),
                new Screen("recovery code", () -> recoveryDialog(code)),
                new Screen("authenticated", this::doneDialog));

        boolean ok = true;

        for (Screen screen : screens) {
            try {
                screen.build().get();
            } catch (RuntimeException | LinkageError error) {
                ok = false;
                plugin.getLogger().log(java.util.logging.Level.SEVERE,
                        "The \"" + screen.name() + "\" dialog cannot be built on this server — any "
                                + "player who reaches it will get no screen at all.", error);
            }
        }

        return ok;
    }

    // ─── Screens ──────────────────────────────────────────────────────────────────────────────

    /**
     * The unlinked player's welcome. Closable, shown once, and it runs `/link` for them.
     *
     * A notice dialog rather than a confirmation: there is one thing to do, so offering a second
     * button would only add a way to get it wrong.
     */
    private Dialog instructions() {
        return Dialog.create(builder -> builder.empty()
                .base(DialogBase.builder(text("auth.dialog-link-title"))
                        .body(List.of(
                                DialogBody.plainMessage(text("auth.dialog-link-body")),
                                DialogBody.plainMessage(text("auth.dialog-link-steps"))))
                        // Closable, deliberately: everything past this point happens outside the
                        // dialog — in chat, and on Discord.
                        .canCloseWithEscape(true)
                        .afterAction(DialogBase.DialogAfterAction.CLOSE)
                        .build())
                .type(DialogType.notice(
                        ActionButton.builder(text("auth.dialog-link-button"))
                                .tooltip(text("auth.dialog-link-tooltip"))
                                // Runs the command the player would otherwise have to type, which is
                                // the deadlock's root cause removed rather than worked around.
                                //
                                // Dispatched server-side rather than with `commandTemplate`, which
                                // is a *macro* action: it parses its argument for `$(…)` variables
                                // and rejects a plain command outright. `/link` takes no arguments,
                                // so there is nothing to substitute and nothing to template.
                                .action(DialogAction.customClick((response, audience) ->
                                        onMain(() -> runLink(player(audience))), BUTTON_OPTIONS))
                                .build())));
    }

    /** Runs `/link` on the player's behalf. Main thread. */
    private void runLink(Player player) {
        if (player == null || !player.isOnline()) {
            return;
        }

        // Dispatched as the player, so it passes through the same allowlist an unauthenticated
        // player's own typing would — `link` is on it, and nothing here bypasses that check.
        player.performCommand("link");
    }

    /**
     * The legacy account screen: linked before passwords existed, so there is nothing to log in
     * with yet.
     *
     * <h2>This is a migration, not an error</h2>
     *
     * The account is fully valid — Discord is linked and trusted, and only the password is missing.
     * Telling these players "you have not set a password" framed a normal state as a fault, and gave
     * them nothing to do about it. This says what happened and offers the single button that fixes
     * it.
     *
     * The player never re-links and never needs another link code: the existing link is what proves
     * who they are, and the recovery code is redeemed against it.
     */
    private Dialog completeSetup(AuthService.RecoveryCode code) {
        List<DialogBody> body = new java.util.ArrayList<>();
        body.add(DialogBody.plainMessage(text("auth.dialog-setup-body")));

        if (code == null) {
            // No code yet — the ordinary state the first time this opens. The screen still draws in
            // full, and the second button fetches one.
            body.add(DialogBody.plainMessage(text("auth.dialog-setup-need-code")));
        } else {
            // The code, on its own line, in the screen the player is already looking at. They read
            // it here and type it into Discord.
            body.add(DialogBody.plainMessage(Component.text(code.code())));
            body.add(DialogBody.plainMessage(text("auth.dialog-setup-steps",
                    "minutes", String.valueOf(code.minutesValid()))));
            body.add(DialogBody.plainMessage(text("auth.dialog-setup-then")));
        }

        return Dialog.create(builder -> builder.empty()
                .base(DialogBase.builder(text("auth.dialog-setup-title"))
                        .body(List.copyOf(body))
                        // The password field is here from the start: once they have set their
                        // password on Discord they type it straight into this screen and are in.
                        // Two trips to one dialog rather than two different dialogs.
                        .inputs(List.of(DialogInput.text(PASSWORD_KEY, text("auth.dialog-login-field"))
                                .maxLength(PASSWORD_MAX_LENGTH)
                                .build()))
                        .canCloseWithEscape(false)
                        .afterAction(DialogBase.DialogAfterAction.CLOSE)
                        .build())
                .type(DialogType.confirmation(
                        ActionButton.builder(text("auth.dialog-setup-login-button"))
                                .tooltip(text("auth.dialog-setup-login-tooltip"))
                                .action(DialogAction.customClick((response, audience) -> {
                                    String typed = response.getText(PASSWORD_KEY);
                                    onMain(() -> submit(player(audience), typed));
                                }, BUTTON_OPTIONS))
                                .build(),
                        ActionButton.builder(text(code == null
                                        ? "auth.dialog-setup-getcode-button"
                                        : "auth.dialog-setup-again-button"))
                                .tooltip(text("auth.dialog-setup-again-tooltip"))
                                // Fetches a code, or re-shows the one already held — the service
                                // hands back what it issued rather than minting another.
                                .action(DialogAction.customClick((response, audience) ->
                                        onMain(() -> requestAndReshow(player(audience))), BUTTON_OPTIONS))
                                .build())));
    }

    /**
     * Fetches the setup code and redraws the screen with it.
     *
     * The redraw happens whether or not the request succeeded: on failure the player is told the API
     * is unavailable and still gets the screen back, rather than being left staring at a world they
     * cannot interact with.
     */
    private void requestAndReshow(Player player) {
        if (player == null || !player.isOnline()) {
            return;
        }

        auth.requestRecovery(player, issued -> reshow(player));
    }

    /** The player behind a dialog callback's audience, or null when it was not one. */
    private static Player player(net.kyori.adventure.audience.Audience audience) {
        return audience instanceof Player player ? player : null;
    }

    /** The ordinary login: one password field, one Login button, one Forgot Password button. */
    private Dialog login(AuthState state) {
        return Dialog.create(builder -> builder.empty()
                .base(DialogBase.builder(text("auth.dialog-login-title"))
                        .body(List.of(DialogBody.plainMessage(state.retryAfterMs() > 0
                                ? text("auth.rate-limited", "minutes",
                                        String.valueOf(Math.max(1, state.retryAfterMs() / 60_000L)))
                                : text("auth.dialog-login-body"))))
                        .inputs(List.of(DialogInput.text(PASSWORD_KEY, text("auth.dialog-login-field"))
                                .maxLength(PASSWORD_MAX_LENGTH)
                                .build()))
                        // Not dismissable: there is nothing else an unauthenticated player can do,
                        // and everything needed to proceed is on this screen.
                        .canCloseWithEscape(false)
                        // The client dismisses the dialog once a button is pressed. There is no
                        // server-side close in this API, so this is the only thing that takes the
                        // screen away — without it a correct password would leave the player
                        // staring at the box they just answered.
                        .afterAction(DialogBase.DialogAfterAction.CLOSE)
                        .build())
                .type(DialogType.confirmation(
                        ActionButton.builder(text("auth.dialog-login-button"))
                                .action(DialogAction.customClick((response, audience) -> {
                                    String typed = response.getText(PASSWORD_KEY);
                                    onMain(() -> submit(player(audience), typed));
                                }, BUTTON_OPTIONS))
                                .build(),
                        ActionButton.builder(text("auth.dialog-forgot-button"))
                                .tooltip(text("auth.dialog-forgot-tooltip"))
                                // One code, shown once. The service hands back the code the player
                                // already holds rather than replacing it, so a second press cannot
                                // invalidate the one on their screen.
                                .action(DialogAction.customClick((response, audience) ->
                                        onMain(() -> forgot(player(audience))), BUTTON_OPTIONS))
                                .build())));
    }

    /** Issues a code and shows it. Guarded, because a callback's audience may not be a player. */
    private void forgot(Player player) {
        if (player == null || !player.isOnline()) {
            return;
        }

        auth.requestRecovery(player, issued -> issued.ifPresent(code -> showRecovery(player, code)));
    }

    /**
     * The recovery code, as a dialog of its own.
     *
     * Shown rather than only printed to chat because the player has to read it off this screen and
     * type it into Discord on another device — often a phone in their other hand. Chat scrolls; a
     * dialog does not. It is also sent to chat by {@link AuthService}, so it survives being closed.
     */
    private void showRecovery(Player player, AuthService.RecoveryCode code) {
        player.showDialog(recoveryDialog(code));
    }

    /** The recovery screen, separated from showing it so the boot self-test can build it. */
    private Dialog recoveryDialog(AuthService.RecoveryCode code) {
        return Dialog.create(builder -> builder.empty()
                .base(DialogBase.builder(text("auth.dialog-recovery-title"))
                        .body(List.of(
                                DialogBody.plainMessage(Component.text(code.code())),
                                DialogBody.plainMessage(text("auth.dialog-recovery-body",
                                        "minutes", String.valueOf(code.minutesValid())))))
                        // Closable: they need to leave it to open Discord, and the code is in chat
                        // as well. Closing this must not put them back at a password box they
                        // cannot yet answer.
                        .canCloseWithEscape(true)
                        .afterAction(DialogBase.DialogAfterAction.CLOSE)
                        .build())
                .type(DialogType.notice(
                        ActionButton.builder(text("auth.dialog-recovery-button"))
                                .action(null)
                                .build())));
    }

    /**
     * Replaces whatever is on screen with a confirmation that the player is in.
     *
     * Used when something outside the dialog authenticated them — a password set from Discord while
     * they sat at the login box. Showing a dialog replaces the current one, which is the only way to
     * take a screen away: the API has no server-side close, by design, so that a server cannot yank
     * a prompt out from under someone mid-keystroke.
     */
    public void dismiss(Player player) {
        if (!supports(player)) {
            player.sendMessage(messages.prefixed("auth.password-changed"));
            return;
        }

        player.showDialog(doneDialog());
    }

    /** The "you're in" screen, separated from showing it so the boot self-test can build it. */
    private Dialog doneDialog() {
        return Dialog.create(builder -> builder.empty()
                .base(DialogBase.builder(text("auth.dialog-done-title"))
                        .body(List.of(DialogBody.plainMessage(text("auth.dialog-done-body"))))
                        .canCloseWithEscape(true)
                        .afterAction(DialogBase.DialogAfterAction.CLOSE)
                        .build())
                .type(DialogType.notice(
                        ActionButton.builder(text("auth.dialog-done-button"))
                                .action(null)
                                .build())));
    }

    // ─── Plumbing ─────────────────────────────────────────────────────────────────────────────

    /**
     * Submits a password and re-shows the dialog when it was wrong.
     *
     * The re-show is scheduled a tick later: the client is still closing the dialog it just
     * submitted, and pushing another into that close is how one silently fails to appear.
     */
    private void submit(Player player, String typed) {
        if (player == null || !player.isOnline()) {
            return;
        }

        if (typed == null || typed.isBlank()) {
            player.sendMessage(messages.prefixed("auth.empty-password"));
            reshow(player);
            return;
        }

        auth.login(player, typed.trim(), result -> {
            // Nothing closes the dialog here, and nothing needs to: every screen sets
            // `afterAction(CLOSE)`, so the client has already dismissed it by the time this runs.
            // There is no server-side close in the API — see `dismiss`.
            if (result.ok()) {
                return;
            }

            if (result.needsPassword()) {
                // The account lost its password between joining and now — an administrator reset it
                // mid-session. Re-showing lands them on the setup screen rather than a login box
                // there is nothing to answer.
                reshow(player);
                return;
            }

            if (result.rateLimited()) {
                player.sendMessage(messages.prefixed("auth.rate-limited",
                        "minutes", String.valueOf(Math.max(1, result.retryAfterMs() / 60_000L))));
            } else {
                player.sendMessage(messages.prefixed("auth.wrong-password",
                        "attempts", result.attemptsRemaining() < 0
                                ? "?"
                                : String.valueOf(result.attemptsRemaining())));
            }

            reshow(player);
        });
    }

    private void reshow(Player player) {
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            if (player != null && player.isOnline() && !auth.isAuthenticated(player.getUniqueId())) {
                show(player);
            }
        });
    }

    /**
     * Hops back to the main thread.
     *
     * A dialog callback is delivered on the thread that processed the packet, and everything it
     * leads to here — teleporting, closing a dialog, firing an event — is main-thread work.
     */
    private void onMain(Runnable action) {
        plugin.getServer().getScheduler().runTask(plugin, action);
    }

    private Component text(String key, Object... placeholders) {
        return messages.component(key, placeholders);
    }
}
