package org.robtic.mail;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.kyori.adventure.text.Component;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.api.ApiException;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.ApiSettings;
import org.robtic.core.config.MessageCatalog;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * Reading the mailbox and delivering what is waiting in it.
 *
 * <h2>The API owns the mail; this owns showing it</h2>
 *
 * Nothing is stored here. A mailbox that lived in plugin memory would be empty after every restart
 * and would differ between servers, which for "you have been jailed, here is why" is the difference
 * between a punishment somebody understands and one they do not. This reads what the network holds
 * and renders it.
 *
 * <h2>The unread count is cached, the mail is not</h2>
 *
 * The count is on the join response and is wanted on every render of the mailbox item, so it is kept
 * in memory and refreshed when anything changes it. The mail itself is fetched when a player opens
 * their mailbox — it is a menu they open occasionally, and holding a copy would only create a second
 * version to go stale.
 */
public final class MailService {

    private final Plugin plugin;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final MessageCatalog messages;

    /** Unread count per online player, for the mailbox item and the join notice. */
    private final Map<UUID, Integer> unread = new ConcurrentHashMap<>();

    public MailService(Plugin plugin, ApiGateway gateway, ApiSettings api, MessageCatalog messages) {
        this.plugin = plugin;
        this.gateway = gateway;
        this.api = api;
        this.messages = messages;
    }

    public int unreadCount(UUID uuid) {
        return unread.getOrDefault(uuid, 0);
    }

    /** Seeded from the join response, which already carries the count. */
    public void setUnread(UUID uuid, int count) {
        unread.put(uuid, Math.max(0, count));
    }

    public void forget(UUID uuid) {
        unread.remove(uuid);
    }

    // ─── Sending ──────────────────────────────────────────────────────────────────────────────

    /**
     * Posts a letter, to be delivered the next time the recipient joins.
     *
     * <h2>Queued, not sent</h2>
     *
     * {@link ApiGateway#submit} hands the write to the request queue, which retries it across an
     * outage and survives a restart. That matters more here than for most writes: the letters this
     * carries are warnings about things a player is about to lose, and one dropped because the API
     * blinked is one nobody ever finds out about.
     *
     * <h2>The reference id is the idempotency key</h2>
     *
     * The API deduplicates on {@code requestId}, and it is derived from the caller's reference rather
     * than randomly. A queued request replayed after an outage therefore produces one letter rather
     * than three — which is the whole reason the route is idempotent on the far side.
     *
     * @param reference links the letter back to whatever produced it. Blank generates a fresh id,
     *                  which is correct for a genuinely one-off letter and wrong for anything a
     *                  sweep might re-send
     */
    public void send(
            UUID recipient,
            String username,
            String category,
            String subject,
            List<String> body,
            String senderName,
            boolean important,
            String reference
    ) {
        JsonObject payload = new JsonObject();

        payload.addProperty("guildId", api.guildId());
        payload.addProperty("uuid", recipient.toString());
        payload.addProperty("username", username == null ? "" : username);
        payload.addProperty("category", category);
        payload.addProperty("subject", subject);

        JsonArray lines = new JsonArray();
        body.forEach(lines::add);
        payload.add("body", lines);

        if (senderName != null && !senderName.isBlank()) {
            payload.addProperty("senderName", senderName);
        }

        payload.addProperty("important", important);

        if (reference != null && !reference.isBlank()) {
            payload.addProperty("referenceId", reference);
        }

        payload.addProperty("serverId", api.serverId());
        payload.addProperty("serverName", api.serverName());

        String requestId = reference == null || reference.isBlank()
                ? ApiGateway.newRequestId()
                : ApiGateway.requestIdFor("mail-send", recipient, reference);

        payload.addProperty("requestId", requestId);

        gateway.submit("/api/mail", payload, requestId);

        // The recipient may be online and looking at their mailbox item. Bumping the local count now
        // means the badge is right immediately rather than after their next join; if the write fails
        // the count is one too high until the next mailbox open corrects it, which nobody notices.
        unread.computeIfPresent(recipient, (uuid, count) -> count + 1);
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    /** The whole mailbox, newest first. */
    public void mailbox(Player player, Consumer<List<Mail>> onLoaded) {
        gateway.read(
                () -> gateway.get("/api/mail", Map.of(
                        "guildId", api.guildId(),
                        "uuid", player.getUniqueId().toString()
                )),
                response -> {
                    unread.put(player.getUniqueId(), Mail.unreadFromJson(response));
                    onLoaded.accept(Mail.listFromJson(response));
                },
                error -> {
                    report("open the mailbox for " + player.getName(), error);
                    player.sendMessage(messages.prefixed("mail.unavailable"));
                });
    }

    /**
     * Names a mail failure the player cannot diagnose from what they were told.
     *
     * The player always sees "temporarily unavailable", which is the right thing to say to them and
     * the wrong thing to leave as the only record. An outage is genuinely temporary and is already
     * announced once by the gateway, so repeating it per mailbox open would be noise — but a failure
     * the gateway does *not* consider an outage is not temporary at all. A missing route, a key
     * without the `server` scope or a guild mismatch fails every time, forever, and produces exactly
     * the same sentence in chat, which is how a mailbox that has never once worked can look like a
     * network that is briefly down.
     *
     * So the retryable case stays quiet and everything else is named, with the code and status the
     * API actually returned.
     */
    private void report(String attempt, ApiException error) {
        if (error.isRetryable()) {
            plugin.getLogger().fine("Could not " + attempt + " while the API is unreachable: " + error.getMessage());
            return;
        }

        plugin.getLogger().warning("Could not " + attempt + " — the API answered "
                + error.code() + " (HTTP " + error.status() + "): " + error.getMessage()
                + ". This will not resolve on its own: check that the API is running a build that "
                + "serves /api/mail, and that this server's key carries the \"server\" scope for "
                + "guild " + api.guildId() + ".");
    }

    /**
     * Marks a mail read.
     *
     * Fire and forget, and the local count is decremented straight away rather than waiting for the
     * write: the player has the book open in front of them, and a mailbox that still says "1 unread"
     * while they are reading the message reads as broken. A failed write costs a count that is one
     * too low until the next mailbox open corrects it, which nobody notices.
     */
    public void markRead(Player player, Mail mail) {
        if (mail.read()) {
            return;
        }

        unread.computeIfPresent(player.getUniqueId(), (uuid, count) -> Math.max(0, count - 1));

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("uuid", player.getUniqueId().toString());
        body.addProperty("mailId", mail.id());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        String requestId = ApiGateway.requestIdFor("mail-read", player.getUniqueId(), mail.id());
        body.addProperty("requestId", requestId);

        gateway.submit("/api/mail/read", body, requestId);
    }

    // ─── Delivery on join ─────────────────────────────────────────────────────────────────────

    /**
     * Fetches the important mail this player has not been shown, and hands it to the caller.
     *
     * Nothing is acknowledged here — see {@link #acknowledge}. The mail is marked as shown only once
     * something has actually put it in front of the player, because a disconnect part-way through
     * the join sequence is ordinary and losing a jail notice to one is not acceptable.
     */
    public void pending(Player player, Consumer<List<Mail>> onLoaded) {
        gateway.read(
                () -> gateway.get("/api/mail/pending", Map.of(
                        "guildId", api.guildId(),
                        "uuid", player.getUniqueId().toString()
                )),
                response -> {
                    unread.put(player.getUniqueId(), Mail.unreadFromJson(response));
                    onLoaded.accept(Mail.listFromJson(response));
                },
                // Nothing is shown in game: a player who has just joined should not be handed an API
                // error for a mailbox they did not ask to open, and the mail stays pending and
                // arrives next time. The console still hears about it — this is the path a jail
                // notice travels, and it failing permanently is not something to discover from a
                // player asking why they were never told why they were punished.
                error -> report("read pending mail for " + player.getName(), error));
    }

    /** Records that these mails were shown on join, so they are not announced every session. */
    public void acknowledge(Player player, List<Mail> shown) {
        if (shown.isEmpty()) {
            return;
        }

        JsonArray ids = new JsonArray();
        for (Mail mail : shown) {
            ids.add(mail.id());
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("uuid", player.getUniqueId().toString());
        body.add("announcedIds", ids);
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        String requestId = ApiGateway.requestIdFor("mail-shown", player.getUniqueId(), System.currentTimeMillis());
        body.addProperty("requestId", requestId);

        gateway.submit("/api/mail/read", body, requestId);
    }

    /**
     * The chat notice a player sees on join.
     *
     * Important mail is named line by line and made clickable, because the whole point of marking a
     * mail important is that the player must not be able to scroll past it. Ordinary unread mail is
     * one summary line — a player with eleven unread messages does not want eleven lines about it.
     */
    public void announce(Player player, List<Mail> important) {
        for (Mail mail : important) {
            for (Component line : messages.lines("mail.join-important",
                    "subject", mail.subject(),
                    "sender", mail.senderName())) {
                player.sendMessage(line);
            }
        }

        int count = unreadCount(player.getUniqueId());

        if (count > 0) {
            player.sendMessage(messages.prefixed("mail.join-unread", "count", String.valueOf(count)));
        }
    }
}
