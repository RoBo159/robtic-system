package org.robtic.essentials.afk;

import org.bukkit.OfflinePlayer;
import org.robtic.core.placeholder.RobticPlaceholders;
import org.robtic.core.util.Durations;
import org.robtic.core.util.Robs;

import java.util.UUID;

/**
 * The AFK placeholders.
 *
 * <h2>Two memory reads and a subtraction</h2>
 *
 * The session is derived from its start timestamp rather than read from a counter, which is exactly
 * what makes these safe to put in a tab list: there is no value being kept current on a timer that a
 * one-second refresh could catch mid-update.
 */
public final class AfkPlaceholders implements RobticPlaceholders.Extension {

    private final AfkService afk;
    private final AfkRewardService rewards;

    public AfkPlaceholders(AfkService afk, AfkRewardService rewards) {
        this.afk = afk;
        this.rewards = rewards;
    }

    @Override
    public String resolve(OfflinePlayer player, String key) {
        if (player == null) {
            return null;
        }

        UUID uuid = player.getUniqueId();

        return switch (key) {
            case "afk" -> afk.isAfk(uuid) ? "yes" : "no";
            case "afk_session" -> Durations.compact(afk.sessionMillis(uuid));
            case "afk_today" -> Durations.compact(rewards.statistics(uuid).todayMillis());
            case "afk_total" -> Durations.compact(rewards.statistics(uuid).totalMillis());

            // Formatted, not String.valueOf. Lifetime AFK earnings are robs, and robs carry two
            // decimal places — the raw form rendered "1240.0" in a tab list.
            case "afk_robs" -> Robs.format(rewards.statistics(uuid).totalRobs());

            default -> null;
        };
    }
}
