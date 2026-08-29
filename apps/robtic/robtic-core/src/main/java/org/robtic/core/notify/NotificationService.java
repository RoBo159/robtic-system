package org.robtic.core.notify;

/**
 * What a plugin can ask to have told to a player.
 *
 * <h2>The whole API is one method</h2>
 *
 * Deliberately. Every question a sender might want to ask — did it arrive, which channel took it,
 * is the player online — is one this seam cannot answer honestly: delivery crosses a network, a
 * mailbox is read hours later, and a Discord bot works on its own schedule. A method returning a
 * delivery result would be a lie that callers would then branch on.
 *
 * So {@link #send} is fire-and-forget, and the interesting decisions — which channels, how often,
 * what is suppressed — belong to the operator's configuration rather than to the calling code.
 *
 * <h2>Absent means silent, never broken</h2>
 *
 * A server whose notification module is disabled resolves {@link #NONE}. Sending succeeds and does
 * nothing. A system that warns a player five times over a licence's last three days therefore needs
 * no branch around any of them — the calls are simply free.
 *
 * <h2>How to obtain one</h2>
 *
 * <pre>{@code
 * NotificationService notify =
 *         RobticServices.findOr(NotificationService.class, NotificationService.NONE);
 * }</pre>
 *
 * Resolved at enable and re-resolved on reload, like every other optional service in this ecosystem.
 */
public interface NotificationService {

    /**
     * Tells a player something, through whichever channels the notification's category is configured
     * to reach.
     *
     * Repeats are dropped: a notification whose {@link Notification#id()} has already been delivered
     * is silently ignored. That is what lets a sweep that runs every minute call this every time it
     * observes "three days remaining" without the player being told sixty times an hour.
     */
    void send(Notification notification);

    /**
     * Publishes a new way of reaching players.
     *
     * Registered by whoever owns the transport — RobticMail registers mail, RobticDiscord's presence
     * enables Discord. Registering a channel id that already exists replaces it, so a server owner
     * can override a built-in channel with their own.
     */
    void register(NotificationChannel channel);

    /** Whether a channel id is registered and currently able to deliver. */
    boolean has(String channelId);

    /**
     * The implementation used when notifications are switched off or the module never started.
     *
     * Not null and not an exception, for the same reason {@code DiscordService.NONE} is not: a
     * consumer writes one code path either way.
     */
    NotificationService NONE = new NotificationService() {

        @Override
        public void send(Notification notification) {
        }

        @Override
        public void register(NotificationChannel channel) {
        }

        @Override
        public boolean has(String channelId) {
            return false;
        }
    };
}
