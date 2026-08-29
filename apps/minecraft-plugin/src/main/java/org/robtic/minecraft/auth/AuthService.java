package org.robtic.minecraft.auth;

import com.google.gson.JsonObject;
import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.api.ApiClient;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.config.MessageCatalog;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * RobticAuth on the game server: who has proved who they are, and what to do about the rest.
 *
 * <h2>This class decides nothing about credentials</h2>
 *
 * It holds no password, no hash and no recovery secret. It asks the API three questions — what is
 * this player's state, is this password correct, give them a recovery code — and acts on the
 * answers. A credential check inside a game server is a credential check inside a process that also
 * runs other people's plugins, which is exactly the arrangement RobticAuth exists to avoid.
 *
 * <h2>Restrictions are read from here, on the tick</h2>
 *
 * {@link #isAuthenticated} is a map lookup, because it is consulted by every movement, chat, click
 * and block change an unauthenticated player produces. Nothing on that path touches the network.
 *
 * <h2>An unreachable API refuses rather than admits</h2>
 *
 * If the state read fails, the player stays unauthenticated and is told the server is having
 * trouble. The alternative — letting somebody in because the check could not be made — turns an API
 * outage into an open door, and an outage is precisely when nobody is watching.
 */
public final class AuthService {

    private final Plugin plugin;
    private final ApiClient client;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final MessageCatalog messages;

    /** Per connected player. Absence means "not tracked", which restrictions treat as not allowed. */
    private final Map<UUID, AuthState> states = new ConcurrentHashMap<>();

    /** The recovery code each player currently holds, so pressing the button twice cannot mint two. */
    private final Map<UUID, RecoveryCode> issued = new ConcurrentHashMap<>();

    private volatile AuthSettings settings;

    /** Shows the login or link prompt. Injected so this never depends on a particular GUI. */
    private volatile Consumer<Player> prompt = player -> {
    };

    /**
     * Takes whatever prompt is on screen away, by replacing it with a confirmation.
     *
     * Needed because a dialog cannot be closed from the server — only the client dismisses one, when
     * a button is pressed. Injected for the same reason as {@link #prompt}: which surface is showing
     * is the router's business, not this service's.
     */
    private volatile Consumer<Player> dismissWith;

    /** Re-applies who can see whom. Injected, so this never depends on the lobby module. */
    private volatile Runnable refreshVisibility = () -> {
    };

    public AuthService(
            Plugin plugin,
            ApiClient client,
            ApiGateway gateway,
            ApiSettings api,
            AuthSettings settings,
            MessageCatalog messages
    ) {
        this.plugin = plugin;
        this.client = client;
        this.gateway = gateway;
        this.api = api;
        this.settings = settings;
        this.messages = messages;

        // Assigned here rather than as a field initializer, which would run before `messages` is
        // set. The default is chat-only, so this service still behaves correctly if no surface ever
        // registers a richer one.
        this.dismissWith = player -> player.sendMessage(messages.prefixed("auth.password-changed"));
    }

    public void updateSettings(AuthSettings replacement) {
        this.settings = replacement;
    }

    public AuthSettings settings() {
        return settings;
    }

    /**
     * Registers what to show a player who must authenticate.
     *
     * A callback rather than a dependency on the GUI: which surface is used — a Paper dialog, an
     * inventory menu — is decided by client capability, and this class has no reason to know that
     * such a decision exists.
     */
    public void promptWith(Consumer<Player> action) {
        this.prompt = action;
    }

    /** Registers how a prompt already on screen is replaced once the player is let in. */
    public void dismissWith(Consumer<Player> action) {
        this.dismissWith = action;
    }

    /**
     * Registers how visibility is re-applied when a player's authentication state changes.
     *
     * An unauthenticated player is invisible to everyone and everyone is invisible to them, so both
     * ends of every pair change the moment somebody logs in — which is one pass over the player
     * list, owned by the visibility service rather than by this one.
     */
    public void onVisibilityChanged(Runnable action) {
        this.refreshVisibility = action;
    }

    // ─── State ────────────────────────────────────────────────────────────────────────────────

    /**
     * Whether this player may act. The hot path — a map read and nothing else.
     *
     * Answers true when the feature is switched off entirely, so disabling RobticAuth does not leave
     * every player permanently restricted.
     */
    public boolean isAuthenticated(UUID uuid) {
        if (!settings.enabled()) {
            return true;
        }

        AuthState state = states.get(uuid);
        return state != null && state.authenticated();
    }

    public Optional<AuthState> stateOf(UUID uuid) {
        return Optional.ofNullable(states.get(uuid));
    }

    /** Players still waiting to authenticate, for the join timeout sweep. */
    public Map<UUID, AuthState> pending() {
        return Map.copyOf(states);
    }

    // ─── Join ─────────────────────────────────────────────────────────────────────────────────

    /**
     * Resolves a joining player's state and puts them where they belong.
     *
     * Runs the read on a worker and applies the result on the tick, like every other join path here.
     * The player is marked unauthenticated *synchronously* first: the read takes a moment, and for
     * that moment they are standing in the world, so the restrictions have to already apply.
     */
    public void resolve(Player player, Location returnTo) {
        if (!settings.enabled()) {
            return;
        }

        UUID uuid = player.getUniqueId();
        String username = player.getName();
        String address = addressOf(player);

        // Pessimistic placeholder, replaced by the real answer below. Without it there is a window
        // between joining and the response in which nothing knows to restrict them.
        states.put(uuid, AuthState.unavailable(returnTo));

        gateway.read(
                () -> client.get("/api/auth/state", query(uuid, username, address)),
                response -> {
                    if (!player.isOnline()) {
                        states.remove(uuid);
                        return;
                    }

                    AuthState state = AuthState.fromJson(response, returnTo);
                    states.put(uuid, state);

                    // Applied on the answer, not on the join: until this point the player is
                    // provisionally unauthenticated and already hidden by the placeholder state, so
                    // this pass is what reveals somebody a live session let straight in.
                    refreshVisibility.run();

                    if (state.authenticated()) {
                        // A live session was accepted. They are never asked anything.
                        announce(player, PlayerAuthenticatedEvent.Method.SESSION);
                        return;
                    }

                    plugin.getServer().getPluginManager().callEvent(new PlayerUnauthenticatedEvent(
                            player, PlayerUnauthenticatedEvent.Reason.JOIN, state.linked()));

                    play(player, settings.promptSound());
                    prompt.accept(player);
                },
                error -> {
                    if (!player.isOnline()) {
                        states.remove(uuid);
                        return;
                    }

                    // Left unauthenticated on purpose. See the class note: an outage must not be a
                    // way in.
                    plugin.getLogger().warning("Could not resolve the auth state for " + username
                            + " — they stay restricted: " + error.getMessage());
                    player.sendMessage(messages.prefixed("auth.unavailable"));
                });
    }

    /** Stops tracking a player who has left. Authentication does not outlive the connection. */
    public void forget(UUID uuid) {
        states.remove(uuid);
        issued.remove(uuid);
    }

    // ─── Before the world ─────────────────────────────────────────────────────────────────────
    //
    // The two calls below block, and are the only ones here that do. They exist for the
    // configuration phase, which runs on its own thread before a Player object exists — so there is
    // no tick to protect and no scheduler to hand a callback back to. Everything else on this class
    // goes through the gateway precisely because it runs where blocking would be unacceptable.

    /**
     * Reads a connecting player's state. Blocks; must not be called from the main thread.
     *
     * @return null when the API could not be reached, which the caller must treat as "refuse", not
     *         as "let them in" — see the class note.
     */
    public AuthState readStateBlocking(UUID uuid, String username, String address) {
        try {
            java.util.Map<String, String> query = new java.util.HashMap<>();
            query.put("guildId", api.guildId());
            query.put("uuid", uuid.toString());
            query.put("username", username);

            if (settings.sessionsEnabled() && settings.bindToIp() && address != null) {
                query.put("address", address);
            }

            JsonObject response = client.get("/api/auth/state", query);
            gateway.markAvailable(true);

            // No return location: the player is not in a world yet, and nothing about this path
            // teleports them anywhere.
            return AuthState.fromJson(response, null);
        } catch (ApiException error) {
            if (error.isRetryable()) {
                gateway.markAvailable(false);
            }

            plugin.getLogger().warning("Could not resolve the pre-join auth state for " + username
                    + ": " + error.getMessage());
            return null;
        }
    }

    /** Verifies a password. Blocks; must not be called from the main thread. */
    public LoginResult loginBlocking(UUID uuid, String username, String password, String address) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("uuid", uuid.toString());
        body.addProperty("username", username);
        body.addProperty("password", password);
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        if (settings.bindToIp() && address != null) {
            body.addProperty("address", address);
        }

        body.addProperty("requestId", ApiGateway.requestIdFor("login", uuid, System.nanoTime()));

        try {
            return LoginResult.fromJson(client.post("/api/auth/login", body));
        } catch (ApiException error) {
            plugin.getLogger().warning("Pre-join login failed for " + username + ": " + error.getMessage());
            return LoginResult.unavailable();
        }
    }

    /** Issues a recovery code without a Player. Blocks; for the configuration phase. */
    public Optional<RecoveryCode> requestRecoveryBlocking(UUID uuid, String username) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("uuid", uuid.toString());
        body.addProperty("username", username);
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());
        body.addProperty("requestId", ApiGateway.requestIdFor("recovery", uuid, System.nanoTime()));

        try {
            RecoveryCode code = RecoveryCode.fromJson(client.post("/api/auth/recovery", body));
            // Cached under the same key the in-world path reads, so a player who is let through
            // still holding a code sees the same one rather than being issued a second.
            issued.put(uuid, code);
            return Optional.of(code);
        } catch (ApiException error) {
            plugin.getLogger().warning("Could not issue a pre-join recovery code for " + username
                    + ": " + error.getMessage());
            return Optional.empty();
        }
    }

    // ─── Login ────────────────────────────────────────────────────────────────────────────────

    /**
     * Submits a password.
     *
     * The result is handed back rather than acted on here, because what happens next belongs to the
     * surface that collected it — a dialog re-opens with an error, an inventory menu repaints. What
     * *is* done here is the part that must happen exactly once however the password arrived: lifting
     * the restrictions and announcing it.
     */
    public void login(Player player, String password, Consumer<LoginResult> onResult) {
        UUID uuid = player.getUniqueId();

        JsonObject body = base(uuid, player.getName());
        body.addProperty("password", password);
        if (settings.bindToIp()) {
            body.addProperty("address", addressOf(player));
        }
        body.addProperty("requestId", ApiGateway.requestIdFor("login", uuid, System.nanoTime()));

        gateway.read(
                () -> client.post("/api/auth/login", body),
                response -> {
                    if (!player.isOnline()) {
                        return;
                    }

                    LoginResult result = LoginResult.fromJson(response);

                    if (result.ok()) {
                        authenticate(player, PlayerAuthenticatedEvent.Method.PASSWORD, result.sessionId(),
                                result.expiresAt());
                    } else {
                        play(player, settings.failureSound());
                        states.computeIfPresent(uuid, (key, state) ->
                                state.withRetryAfter(result.retryAfterMs()));
                    }

                    onResult.accept(result);
                },
                error -> {
                    player.sendMessage(messages.prefixed("auth.unavailable"));
                    onResult.accept(LoginResult.unavailable());
                });
    }

    /**
     * Marks a player authenticated, lifts their restrictions and puts them back.
     *
     * The single point where access is granted, whichever route led here — a password, a session, a
     * password change on Discord, or an administrator. Keeping it to one method is what makes "the
     * restrictions are lifted exactly when the event fires" true by construction rather than by
     * three call sites agreeing.
     */
    public void authenticate(Player player, PlayerAuthenticatedEvent.Method method,
                             String sessionId, long expiresAt) {
        UUID uuid = player.getUniqueId();

        AuthState state = states.computeIfPresent(uuid, (key, existing) -> existing.asAuthenticated());
        if (state == null) {
            return;
        }

        play(player, settings.successSound());

        if (sessionId != null) {
            plugin.getServer().getPluginManager().callEvent(
                    new PlayerSessionCreatedEvent(player, sessionId, expiresAt));
        }

        announce(player, method);
    }

    /** Fires the authenticated event and returns the player to where they were going. */
    private void announce(Player player, PlayerAuthenticatedEvent.Method method) {
        plugin.getServer().getPluginManager().callEvent(new PlayerAuthenticatedEvent(player, method));

        // They are real now: everyone can see them, and they can see everyone.
        refreshVisibility.run();
    }

    // ─── News from Discord ────────────────────────────────────────────────────────────────────

    /**
     * A player finished linking on Discord.
     *
     * They are standing in the link world watching a screen that will not change on its own, so this
     * is the moment they find out it worked. Their state is re-resolved rather than patched: the
     * link may have arrived with a password or without one, and the API is the thing that knows.
     */
    public void onLinked(UUID uuid, String discordId, boolean hasPassword) {
        Player player = plugin.getServer().getPlayer(uuid);
        if (player == null) {
            return;
        }

        AuthState state = states.get(uuid);
        if (state == null || state.authenticated()) {
            return;
        }

        plugin.getServer().getPluginManager().callEvent(
                new PlayerLinkedEvent(player, discordId, hasPassword));

        player.sendMessage(messages.prefixed("auth.linked"));

        // Straight back to the API rather than assuming what linking implies. A link made with a
        // password leads to the login prompt; one made without leads to recovery; and if the modal
        // also opened a session, this is what notices.
        resolve(player, state.returnTo());
    }

    /**
     * A password was set or changed from Discord.
     *
     * @param authenticate true when the change is itself proof of ownership — a recovery code asked
     *                     for in game and redeemed from the linked Discord account. Somebody sitting
     *                     at the prompt is let in rather than asked to type what they just chose.
     */
    public void onPasswordChanged(UUID uuid, boolean authenticate) {
        Player player = plugin.getServer().getPlayer(uuid);
        if (player == null) {
            return;
        }

        states.computeIfPresent(uuid, (key, state) -> state.withPassword());

        if (authenticate && !isAuthenticated(uuid)) {
            authenticate(player, PlayerAuthenticatedEvent.Method.RECOVERY, null, 0L);

            // The player may still be looking at a login dialog, and the API offers no way to close
            // one from the server — a dialog is dismissed by the client, when a button is pressed.
            //
            // So it is replaced rather than closed: `dismissWith` shows a one-button notice, which
            // takes the place of whatever is on screen. That is also the better outcome, because
            // the alternative is a screen silently vanishing while the player is mid-keystroke.
            dismissWith.accept(player);
            return;
        }

        player.sendMessage(messages.prefixed("auth.password-changed"));
    }

    /**
     * An account was unlinked from Discord.
     *
     * Access is withdrawn from anybody online under it immediately. Waiting for their next join
     * would leave somebody playing on an account that, as far as the network is concerned, they no
     * longer hold.
     */
    public void onUnlinked(UUID uuid) {
        Player player = plugin.getServer().getPlayer(uuid);
        if (player == null) {
            return;
        }

        AuthState state = states.get(uuid);
        Location returnTo = state == null ? player.getLocation() : state.returnTo();

        states.put(uuid, AuthState.unavailable(returnTo));

        plugin.getServer().getPluginManager().callEvent(new PlayerSessionExpiredEvent(
                uuid, null, PlayerSessionExpiredEvent.Cause.UNLINKED));

        plugin.getServer().getPluginManager().callEvent(new PlayerUnauthenticatedEvent(
                player, PlayerUnauthenticatedEvent.Reason.UNLINKED, false));

        player.sendMessage(messages.prefixed("auth.unlinked"));

        // Re-resolved so they land back in the link world with the link prompt, exactly as a new
        // player would — which is what being unlinked means.
        resolve(player, returnTo);
    }

    // ─── Recovery ─────────────────────────────────────────────────────────────────────────────

    /**
     * Asks for a recovery code, which the caller shows the player.
     *
     * Works for a player who has never had a password as well as one who has forgotten theirs — that
     * is the point, and it is what lets an account linked before RobticAuth set its first password
     * without re-linking.
     */
    public void requestRecovery(Player player, Consumer<Optional<RecoveryCode>> onResult) {
        UUID uuid = player.getUniqueId();

        // The code a player already holds is handed back rather than replaced.
        //
        // Issuing is destructive on the API side — a new code invalidates the outstanding one — so
        // without this, pressing the button twice would silently kill the code already on the
        // player's screen and leave them typing a dead one into Discord. Re-showing the same code is
        // also what makes "displayed exactly once" true no matter how often the surface re-renders.
        RecoveryCode held = issued.get(uuid);
        if (held != null && held.isLive()) {
            onResult.accept(Optional.of(held));
            return;
        }

        JsonObject body = base(uuid, player.getName());
        body.addProperty("requestId", ApiGateway.requestIdFor("recovery", uuid, System.nanoTime()));

        gateway.read(
                () -> client.post("/api/auth/recovery", body),
                response -> {
                    RecoveryCode code = RecoveryCode.fromJson(response);
                    issued.put(uuid, code);

                    // Deliberately not printed to chat here. The surface that asked for it shows it
                    // — once — and printing as well would mean every player sees their code twice.
                    onResult.accept(Optional.of(code));
                },
                error -> {
                    player.sendMessage(messages.prefixed("auth.unavailable"));
                    onResult.accept(Optional.empty());
                });
    }

    /** Whether this is a first password rather than a reset, which decides only the wording. */
    public boolean isFirstPassword(UUID uuid) {
        return stateOf(uuid).map(state -> !state.hasPassword()).orElse(false);
    }

    /**
     * The code this player currently holds, or null when they have none.
     *
     * A plain memory read, so a screen can be drawn with the code already in hand without waiting on
     * anything. Nothing that renders a UI should have to make a network call first — that is what
     * left legacy players with no screen at all when the request failed.
     */
    public RecoveryCode heldCode(UUID uuid) {
        RecoveryCode held = issued.get(uuid);
        return held != null && held.isLive() ? held : null;
    }

    // ─── Administration ───────────────────────────────────────────────────────────────────────

    /**
     * Runs one administrative action against a player's account.
     *
     * <h2>Nothing is decided here</h2>
     *
     * Every check — is the target already linked, does the Discord account hold another account,
     * does an account exist to reset — is the API's, because the API is the only party that can make
     * it atomically. This assembles a request, and renders the sentence it gets back. A game server
     * deciding whether a force-link is allowed would be a second opinion racing the first.
     *
     * @param onDone the summary to show the operator, or empty when the request failed
     */
    public void admin(
            org.bukkit.command.CommandSender actor,
            String action,
            UUID targetUuid,
            String targetUsername,
            String discordId,
            Consumer<Optional<AdminResult>> onDone
    ) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("action", action);
        body.addProperty("uuid", targetUuid.toString());
        body.addProperty("username", targetUsername);
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        if (discordId != null) {
            body.addProperty("discordId", discordId);
        }

        // The console has no UUID of its own, so it borrows the nil one. The API only records who
        // acted; it does not resolve the actor to an account.
        UUID actorUuid = actor instanceof Player operator
                ? operator.getUniqueId()
                : new UUID(0L, 0L);

        body.addProperty("actorUuid", actorUuid.toString());
        body.addProperty("actorUsername", actor.getName());

        // Keyed on the moment rather than on the arguments: two deliberate identical resets must
        // both apply, exactly as two deliberate `/robs add` grants do.
        body.addProperty("requestId",
                ApiGateway.requestIdFor("auth-admin-" + action, targetUuid, System.nanoTime()));

        gateway.read(
                () -> client.post("/api/auth/admin", body),
                response -> onDone.accept(Optional.of(AdminResult.fromJson(response))),
                error -> {
                    actor.sendMessage(messages.prefixed("auth.admin-failed", "reason", error.getMessage()));
                    onDone.accept(Optional.empty());
                });
    }

    /** What an administrative action did, as the API described it. */
    public record AdminResult(String action, String summary, java.util.List<SessionSummary> sessions) {

        static AdminResult fromJson(JsonObject json) {
            java.util.List<SessionSummary> sessions = new java.util.ArrayList<>();

            if (json.has("sessions") && json.get("sessions").isJsonArray()) {
                for (var element : json.getAsJsonArray("sessions")) {
                    if (element.isJsonObject()) {
                        sessions.add(SessionSummary.fromJson(element.getAsJsonObject()));
                    }
                }
            }

            return new AdminResult(
                    json.has("action") ? json.get("action").getAsString() : "",
                    json.has("summary") ? json.get("summary").getAsString() : "Done.",
                    java.util.List.copyOf(sessions));
        }
    }

    /** One live session, for `/auth sessions`. Carries no secret beyond its own identifier. */
    public record SessionSummary(String sessionId, String serverId, long expiresAt, long lastLoginAt) {

        static SessionSummary fromJson(JsonObject json) {
            return new SessionSummary(
                    json.has("sessionId") ? json.get("sessionId").getAsString() : "?",
                    json.has("serverId") && !json.get("serverId").isJsonNull()
                            ? json.get("serverId").getAsString()
                            : "unknown",
                    parseInstant(json, "expiresAt"),
                    parseInstant(json, "lastLoginAt"));
        }
    }

    // ─── Results ──────────────────────────────────────────────────────────────────────────────

    /** The answer to a login attempt. */
    public record LoginResult(
            boolean ok,
            String reason,
            String sessionId,
            long expiresAt,
            int attemptsRemaining,
            long retryAfterMs
    ) {
        static LoginResult unavailable() {
            return new LoginResult(false, "unavailable", null, 0L, -1, 0L);
        }

        static LoginResult fromJson(JsonObject json) {
            JsonObject session = json.has("session") && json.get("session").isJsonObject()
                    ? json.getAsJsonObject("session")
                    : null;

            return new LoginResult(
                    json.has("ok") && json.get("ok").getAsBoolean(),
                    json.has("reason") && !json.get("reason").isJsonNull()
                            ? json.get("reason").getAsString()
                            : null,
                    session == null ? null : session.get("sessionId").getAsString(),
                    session == null ? 0L : parseInstant(session, "expiresAt"),
                    json.has("attemptsRemaining") && !json.get("attemptsRemaining").isJsonNull()
                            ? json.get("attemptsRemaining").getAsInt()
                            : -1,
                    json.has("retryAfterMs") && !json.get("retryAfterMs").isJsonNull()
                            ? json.get("retryAfterMs").getAsLong()
                            : 0L);
        }

        /** True when the account has no password, so the caller offers recovery instead of a retry. */
        public boolean needsPassword() {
            return "no_password".equals(reason);
        }

        public boolean rateLimited() {
            return "rate_limited".equals(reason);
        }
    }

    /** A recovery code, ready to show. */
    public record RecoveryCode(String code, int minutesValid, String discordId, long issuedAt) {

        static RecoveryCode fromJson(JsonObject json) {
            return new RecoveryCode(
                    json.get("code").getAsString(),
                    json.has("minutesValid") ? json.get("minutesValid").getAsInt() : 10,
                    json.has("discordId") && !json.get("discordId").isJsonNull()
                            ? json.get("discordId").getAsString()
                            : null,
                    System.currentTimeMillis());
        }

        /**
         * Whether this code is still worth showing.
         *
         * A minute is shaved off the API's own window, so a code that is about to lapse is replaced
         * here rather than handed to a player who would type it into Discord just too late.
         */
        boolean isLive() {
            long lifetime = Math.max(0L, (minutesValid - 1) * 60_000L);
            return System.currentTimeMillis() - issuedAt < lifetime;
        }
    }

    // ─── Plumbing ─────────────────────────────────────────────────────────────────────────────

    private Map<String, String> query(UUID uuid, String username, String address) {
        Map<String, String> query = new java.util.HashMap<>();
        query.put("guildId", api.guildId());
        query.put("uuid", uuid.toString());
        query.put("username", username);

        // Omitted entirely when binding is off, which is what makes the API match the unbound
        // sessions this server issues rather than silently failing to find any.
        if (settings.sessionsEnabled() && settings.bindToIp() && address != null) {
            query.put("address", address);
        }

        return query;
    }

    private JsonObject base(UUID uuid, String username) {
        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("uuid", uuid.toString());
        body.addProperty("username", username);
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());
        return body;
    }

    /** The player's address, without the port Bukkit includes. Null when it cannot be read. */
    private static String addressOf(Player player) {
        java.net.InetSocketAddress socket = player.getAddress();
        return socket == null || socket.getAddress() == null
                ? null
                : socket.getAddress().getHostAddress();
    }

    private void play(Player player, Sound sound) {
        if (sound != null) {
            player.playSound(player.getLocation(), sound, 1f, 1f);
        }
    }

    private static long parseInstant(JsonObject json, String key) {
        try {
            return java.time.Instant.parse(json.get(key).getAsString()).toEpochMilli();
        } catch (RuntimeException unparseable) {
            return 0L;
        }
    }
}
