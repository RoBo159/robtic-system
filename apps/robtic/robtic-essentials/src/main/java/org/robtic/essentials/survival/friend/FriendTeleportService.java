package org.robtic.essentials.survival.friend;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;
import org.robtic.essentials.survival.TeleportService;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * `/friend tp`, and the request it becomes when the target has not opted in.
 *
 * <h2>Manual approval is the default</h2>
 *
 * Somebody appearing beside you unannounced is the kind of thing a player should agree to first,
 * so the default is to ask. A player who wants the convenience turns it on with
 * `/friend settings` — the preference lives in the API and is cached with the friend list.
 *
 * <h2>Pending requests expire</h2>
 *
 * A request nobody answered is dropped after {@link #REQUEST_TIMEOUT_MILLIS}. Without that, an
 * `/friend tpaccept` typed an hour later would teleport somebody who has long since walked away
 * from wherever they asked from — the accept has to mean "yes, now".
 */
public final class FriendTeleportService {

    /** How long an unanswered teleport request stays acceptable. */
    private static final long REQUEST_TIMEOUT_MILLIS = 60_000L;

    /** Target → the request waiting on them. One at a time: a queue nobody can see is confusing. */
    private final Map<UUID, PendingRequest> pending = new ConcurrentHashMap<>();

    private final Plugin plugin;
    private final MessageCatalog messages;
    private final TeleportService teleports;

    public FriendTeleportService(Plugin plugin, MessageCatalog messages, TeleportService teleports) {
        this.plugin = plugin;
        this.messages = messages;
        this.teleports = teleports;
    }

    /** Who asked, and when — the timestamp is what makes the timeout enforceable. */
    private record PendingRequest(UUID requesterUuid, String requesterName, long createdAt) {

        boolean expired() {
            return System.currentTimeMillis() - createdAt > REQUEST_TIMEOUT_MILLIS;
        }
    }

    /** Teleports immediately. Main thread only. */
    public void teleportNow(Player requester, Player target) {
        teleports.remember(requester);
        requester.teleport(target.getLocation());

        requester.sendMessage(messages.prefixed("friend.tp-done", "player", target.getName()));
        target.sendMessage(messages.prefixed("friend.tp-arrived", "player", requester.getName()));
    }

    /**
     * Asks the target to approve a teleport.
     *
     * The prompt carries clickable accept and deny buttons as well as naming the commands, so it
     * works whether the player clicks or types.
     */
    public void requestTeleport(Player requester, Player target) {
        pending.put(target.getUniqueId(),
                new PendingRequest(requester.getUniqueId(), requester.getName(), System.currentTimeMillis()));

        requester.sendMessage(messages.prefixed("friend.tp-requested", "player", target.getName()));

        for (Component line : messages.lines("friend.tp-prompt", "player", requester.getName())) {
            target.sendMessage(line);
        }

        target.sendMessage(Component.empty()
                .append(MessageCatalog.render(messages.text("friend.tp-accept-button"))
                        .clickEvent(ClickEvent.runCommand("/friend tpaccept")))
                .append(Component.space())
                .append(MessageCatalog.render(messages.text("friend.tp-deny-button"))
                        .clickEvent(ClickEvent.runCommand("/friend tpdeny"))));
    }

    /**
     * Accepts whatever is waiting on this player.
     *
     * @return the requester to teleport, or empty when there is nothing live to accept.
     */
    public Optional<UUID> accept(UUID targetUuid) {
        PendingRequest request = pending.remove(targetUuid);

        if (request == null || request.expired()) {
            return Optional.empty();
        }

        return Optional.of(request.requesterUuid());
    }

    /** @return the requester's name, so they can be told they were declined. */
    public Optional<String> deny(UUID targetUuid) {
        PendingRequest request = pending.remove(targetUuid);
        return request == null || request.expired() ? Optional.empty() : Optional.of(request.requesterName());
    }

    public boolean hasPending(UUID targetUuid) {
        PendingRequest request = pending.get(targetUuid);

        if (request == null) {
            return false;
        }

        if (request.expired()) {
            pending.remove(targetUuid);
            return false;
        }

        return true;
    }

    /** Dropped on disconnect: a request cannot be answered by somebody who has left. */
    public void forget(UUID uuid) {
        pending.remove(uuid);
        pending.entrySet().removeIf(entry -> entry.getValue().requesterUuid().equals(uuid));
    }

    public Plugin plugin() {
        return plugin;
    }
}
