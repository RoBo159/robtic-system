package org.robtic.minecraft.auth;

import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;

/**
 * Captures the chat line an unauthenticated player types as their password.
 *
 * <h2>LOWEST, and cancelled before anything else runs</h2>
 *
 * A password typed into chat must never reach another plugin — not a chat formatter, not a logger,
 * not the Discord bridge, and not other players. Cancelling at {@code LOWEST} means no other
 * handler is invoked for the event at all, which is the difference between a password that was
 * never broadcast and one that was broadcast and then retracted.
 *
 * {@code ignoreCancelled} is deliberately absent: a chat plugin that cancelled the line first would
 * otherwise stop the capture, leaving the player typing a password that quietly does nothing.
 *
 * <h2>Separate from AuthRestrictionListener</h2>
 *
 * That one blocks an unauthenticated player's chat outright. This one runs ahead of it and claims
 * the line first when a capture is armed — so the ordinary case (no capture) still falls through to
 * the block, and the login case is consumed here.
 */
public final class AuthChatListener implements Listener {

    private final AuthChatPrompt prompt;

    public AuthChatListener(AuthChatPrompt prompt) {
        this.prompt = prompt;
    }

    @SuppressWarnings("deprecation")
    @EventHandler(priority = EventPriority.LOWEST)
    public void onChat(AsyncPlayerChatEvent event) {
        if (!prompt.isArmed(event.getPlayer().getUniqueId())) {
            return;
        }

        // Cancelled before the capture is even attempted, so an early return below can never leave
        // the line to be delivered.
        event.setCancelled(true);
        prompt.consume(event.getPlayer(), event.getMessage());
    }
}
