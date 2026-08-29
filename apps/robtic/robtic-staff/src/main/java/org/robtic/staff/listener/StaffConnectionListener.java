package org.robtic.staff.listener;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.event.PlayerJoinStateEvent;
import org.robtic.staff.FreezeService;
import org.robtic.staff.JailService;
import org.robtic.staff.LastSeenLocations;
import org.robtic.staff.StaffChatService;
import org.robtic.staff.StaffModeService;
import org.robtic.staff.StaffToolService;
import org.robtic.staff.VanishService;

import java.util.UUID;

/**
 * Everything this plugin does when a player arrives or leaves.
 *
 * <h2>Split from the monolith's one connection listener</h2>
 *
 * That listener handled staff, mail, AFK, roles and the API call in one method. What is left here is
 * only the part RobticStaff owns — which is most of it, because most of what happens on a join is a
 * moderation state being restored.
 *
 * The remote state comes from {@link PlayerJoinStateEvent}, published by Core once per join, rather
 * than from an API call of its own. Everything else is local and happens immediately.
 */
public final class StaffConnectionListener implements Listener {

    private final MessageCatalog messages;

    private final StaffModeService staffMode;
    private final StaffChatService staffChat;
    private final StaffToolService tools;
    private final VanishService vanish;
    private final FreezeService freeze;
    private final JailService jail;
    private final LastSeenLocations lastSeen;

    public StaffConnectionListener(
            MessageCatalog messages,
            StaffModeService staffMode,
            StaffChatService staffChat,
            StaffToolService tools,
            VanishService vanish,
            FreezeService freeze,
            JailService jail,
            LastSeenLocations lastSeen
    ) {
        this.messages = messages;
        this.staffMode = staffMode;
        this.staffChat = staffChat;
        this.tools = tools;
        this.vanish = vanish;
        this.freeze = freeze;
        this.jail = jail;
        this.lastSeen = lastSeen;
    }

    /** The local half: what this server already knows without asking anybody. */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        // Their live position supersedes whatever this server remembered from their last exit.
        lastSeen.forget(event.getPlayer().getUniqueId());

        vanish.applyVisibility();
    }

    /**
     * The remote half: freeze, jail and an interrupted staff-mode session.
     *
     * Already on the main thread — Core publishes this event from the tick — so everything here can
     * touch the world directly.
     */
    @EventHandler
    public void onJoinState(PlayerJoinStateEvent event) {
        UUID uuid = event.getPlayerId();

        Player player = event.getPlayer().orElse(null);

        if (player == null) {
            return;
        }

        if (event.flag("frozen")) {
            freeze.applyRemoteState(uuid, true, null);
        }

        if (event.flag("jailed")) {
            // The reason travels on the join response, so a player who was jailed while offline is
            // told why they are teleported back into the jail rather than arriving with no
            // explanation.
            jail.applyRemoteState(uuid, true, event.text("jailReason"));
        }

        // A staff-mode session the server did not get to end cleanly — a crash, or a kick mid-shift.
        staffMode.recoverIfPending(player);

        long warnings = event.number("warningCount");
        long jails = event.number("jailCount");

        if (warnings > 0 || jails > 0) {
            player.sendMessage(messages.prefixed("staff.join-record",
                    "warnings", String.valueOf(warnings),
                    "jails", String.valueOf(jails)));
        }
    }

    /**
     * Releases everything this plugin holds for a leaving player.
     *
     * Ordering matters and is this plugin's own business now, which is the main benefit of the split:
     * staff mode is ended before the player object is released, and the last-seen position is
     * recorded before anything else can move them.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();

        if (staffMode.isInStaffMode(uuid)) {
            staffMode.disable(player, "disconnect");
        }

        freeze.handleDisconnect(player);

        if (vanish.shouldSuppressConnectionMessage(uuid)) {
            event.quitMessage(null);
        }

        // Recorded before anything else releases the player object: this is where they were, and it
        // is the only chance to take it. A report filed against them a minute from now shows it.
        lastSeen.record(player);

        vanish.forget(uuid);
        tools.forget(uuid);
        staffChat.setEnabled(uuid, false);
    }
}
