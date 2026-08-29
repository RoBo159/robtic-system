package org.robtic.core.notify;

/**
 * One way of reaching a player.
 *
 * <h2>Adding a channel must not touch a single sender</h2>
 *
 * Chat, mail and Discord ship with the system. A toast, a boss bar, a webhook or a push to a phone
 * are all the same shape: implement this, register it, name it in {@code notifications.yml}. Nothing
 * that sends a notification changes, because senders name a {@link Notification#category()} and
 * never a channel.
 *
 * <h2>Contract</h2>
 *
 * {@link #deliver} is called on the main thread. It must not block: a channel that crosses a network
 * hands the work to a scheduler and returns immediately, exactly as {@code DiscordService} does. A
 * channel that throws is logged and skipped, and the remaining channels still deliver — losing a
 * Discord message must never cost the player their in-game warning.
 *
 * <h2>Absent is a normal state</h2>
 *
 * {@link #available()} answers false when the channel's dependency is missing — RobticMail not
 * installed, Discord unreachable, the player offline. The dispatcher skips it silently. That is not
 * a failure worth logging per message; an operator who has not installed RobticMail has not
 * misconfigured anything.
 */
public interface NotificationChannel {

    /** Short lowercase id, matched against the channel lists in {@code notifications.yml}. */
    String id();

    /**
     * Whether this channel can deliver right now.
     *
     * Asked per notification rather than once at startup, because the answer genuinely changes: a
     * player logs out, an API goes down, an optional plugin is enabled mid-session.
     */
    default boolean available() {
        return true;
    }

    /**
     * Delivers, or does nothing if it cannot.
     *
     * Never throws for an ordinary failure — an unreachable API, an offline player. Those are
     * expected, and the dispatcher has no useful response to them.
     */
    void deliver(Notification notification);
}
