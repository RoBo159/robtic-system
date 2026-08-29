package org.robtic.core.discord;

import org.bukkit.plugin.Plugin;
import org.robtic.core.service.RobticServices;

import java.util.Optional;
import java.util.UUID;

/**
 * A plugin's Discord integration, resolved once at startup.
 *
 * <h2>Three states, and only one of them says anything</h2>
 *
 * <ol>
 *   <li><b>{@code discord.enabled: false}</b> — the shipped default. Nothing is checked, nothing is
 *       resolved, nothing is logged. A server that does not use Discord should not be told about it
 *       on every start.</li>
 *   <li><b>Enabled, RobticDiscord present</b> — the real service is used. One line at info, because
 *       an operator turning it on wants to see that it took.</li>
 *   <li><b>Enabled, RobticDiscord absent</b> — <em>one</em> warning naming the plugin and what to do
 *       about it, then the plugin runs on with Discord silently disabled.</li>
 * </ol>
 *
 * The warning is printed once, here, at enable. Nothing re-checks: a plugin that loads later cannot
 * be picked up mid-session anyway, and a periodic re-check would be exactly the console spam this
 * is designed to avoid.
 *
 * <h2>Why every plugin gets one of these rather than a DiscordService directly</h2>
 *
 * Because "is Discord on for me" is a different question from "is Discord installed". A server may
 * run RobticDiscord for authentication while leaving Discord logging off in RobticJobs. This object
 * answers the first question, which is the one a feature actually has.
 */
public final class DiscordIntegration {

    private final DiscordSettings settings;
    private final DiscordService service;

    private DiscordIntegration(DiscordSettings settings, DiscordService service) {
        this.settings = settings;
        this.service = service;
    }

    /**
     * Resolves a plugin's integration and reports the outcome exactly once.
     *
     * @param plugin   the plugin asking, used for its name and its logger
     * @param settings its own {@code discord:} section
     */
    public static DiscordIntegration resolve(Plugin plugin, DiscordSettings settings) {
        if (!settings.enabled()) {
            // Silent. This is the default and it is not a problem.
            return new DiscordIntegration(settings, DiscordService.NONE);
        }

        Optional<DiscordService> found = RobticServices.find(DiscordService.class);

        if (found.isEmpty()) {
            plugin.getLogger().warning("Discord integration is enabled but RobticDiscord is not"
                    + " installed. Discord features have been disabled. Install RobticDiscord, or"
                    + " set discord.enabled to false to stop seeing this.");

            return new DiscordIntegration(settings, DiscordService.NONE);
        }

        if (settings.isEmpty()) {
            plugin.getLogger().warning("Discord integration is enabled but no channels or roles are"
                    + " configured, so nothing will be sent. Fill in the discord section, or set"
                    + " discord.enabled to false.");
        }

        return new DiscordIntegration(settings, found.get());
    }

    /**
     * Whether this plugin should do Discord work at all.
     *
     * False when the operator turned it off <em>and</em> when RobticDiscord is missing, so a caller
     * that wraps an expensive embed build in this check pays nothing in either case.
     */
    public boolean active() {
        return settings.enabled() && service != DiscordService.NONE;
    }

    public DiscordSettings settings() {
        return settings;
    }

    // ─── Convenience ──────────────────────────────────────────────────────────────────────────
    //
    // Each takes the configured channel or role *name* rather than an ID, so a caller never reads
    // the settings itself and an unset name is a no-op instead of a null check at every call site.

    /** Sends text to a configured channel. Does nothing when the channel is unset or Discord is off. */
    public void send(String channelName, String message) {
        if (!active()) {
            return;
        }

        settings.channel(channelName).ifPresent(id -> service.sendMessage(id, message));
    }

    /**
     * Sends an embed to a configured channel.
     *
     * The embed is supplied as a supplier rather than a value, so a caller that builds one out of
     * several lookups pays nothing when Discord is off — which is the normal case.
     */
    public void send(String channelName, java.util.function.Supplier<DiscordEmbed> embed) {
        if (!active()) {
            return;
        }

        settings.channel(channelName).ifPresent(id -> service.sendEmbed(id, embed.get()));
    }

    /** Grants a configured role. Does nothing when the role is unset or Discord is off. */
    public void grant(UUID player, String roleName) {
        if (!active()) {
            return;
        }

        settings.role(roleName).ifPresent(id -> service.assignRole(player, id));
    }

    /** Removes a configured role. Does nothing when the role is unset or Discord is off. */
    public void revoke(UUID player, String roleName) {
        if (!active()) {
            return;
        }

        settings.role(roleName).ifPresent(id -> service.removeRole(player, id));
    }

    /** The underlying service, for the rare caller that needs an ID it did not configure. */
    public DiscordService service() {
        return service;
    }
}
