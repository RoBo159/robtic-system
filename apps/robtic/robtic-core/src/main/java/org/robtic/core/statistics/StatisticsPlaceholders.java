package org.robtic.core.statistics;

import org.bukkit.OfflinePlayer;
import org.robtic.core.placeholder.RobticPlaceholders;
import org.robtic.core.statistics.api.StatisticDefinition;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Placeholders for every registered statistic, without any of them being named in code.
 *
 * <pre>
 *   %robtic_stat_&lt;id&gt;%          5,000     formatted through the statistic's type
 *   %robtic_stat_raw_&lt;id&gt;%      5000      the stored number, for comparisons and scoreboards
 *   %robtic_stat_has_&lt;id&gt;%      yes / no  whether they have ever recorded one
 *   %robtic_stat_name_&lt;id&gt;%     Coal Mined
 *   %robtic_stat_total_&lt;cat&gt;%   12,430    every numeric statistic in a category, summed
 * </pre>
 *
 * <h2>Resolved from the registry, not from a table</h2>
 *
 * There is no list of supported placeholders here and there must not be. A statistic registered by a
 * plugin that did not exist when this class was written resolves the moment it is registered — which
 * is the difference between "the statistics system supports placeholders" and "the statistics system
 * supports the placeholders somebody remembered to add".
 *
 * <h2>Prefix order matters</h2>
 *
 * {@code stat_raw_} is checked before {@code stat_}, because a statistic genuinely called
 * {@code raw_something} is possible and the longer prefix must win. Checking the other way round
 * would resolve {@code stat_raw_coal_mined} as the statistic {@code raw_coal_mined}, silently, and
 * return an empty value nobody could explain.
 *
 * <h2>Cost</h2>
 *
 * A tab list resolves these for every player every second. Every value here is a memory read against
 * the repository cache — nothing touches storage or the network, and an unrecognised key returns null
 * after one prefix comparison so the other extensions still get their turn.
 */
public final class StatisticsPlaceholders implements RobticPlaceholders.Extension {

    private static final String PREFIX = "stat_";
    private static final String RAW = "stat_raw_";
    private static final String HAS = "stat_has_";
    private static final String NAME = "stat_name_";
    private static final String TOTAL = "stat_total_";

    private static final NumberFormat NUMBERS = NumberFormat.getInstance(Locale.ROOT);

    private final StatisticsService statistics;

    public StatisticsPlaceholders(StatisticsService statistics) {
        this.statistics = statistics;
    }

    @Override
    public String resolve(OfflinePlayer player, String key) {
        if (player == null || !key.startsWith(PREFIX)) {
            return null;
        }

        UUID uuid = player.getUniqueId();

        // Longest prefix first. See the class comment for why the order is load-bearing.
        if (key.startsWith(RAW)) {
            return known(key.substring(RAW.length()))
                    .map(definition -> Long.toString(statistics.get(uuid, definition.id())))
                    .orElse(null);
        }

        if (key.startsWith(HAS)) {
            return known(key.substring(HAS.length()))
                    .map(definition -> statistics.has(uuid, definition.id()) ? "yes" : "no")
                    .orElse(null);
        }

        if (key.startsWith(NAME)) {
            return known(key.substring(NAME.length()))
                    .map(StatisticDefinition::display)
                    .orElse(null);
        }

        if (key.startsWith(TOTAL)) {
            String category = key.substring(TOTAL.length());

            // Unlike a statistic id, a category that resolves to nothing is not an error worth
            // reporting as unrecognised — an empty category legitimately totals zero.
            return NUMBERS.format(statistics.total(uuid, category));
        }

        return known(key.substring(PREFIX.length()))
                .map(definition -> statistics.format(uuid, definition.id()))
                .orElse(null);
    }

    /**
     * The definition for an id, or empty when nothing is registered under it.
     *
     * Returning empty — and therefore null from {@code resolve} — rather than "0" is deliberate. A
     * placeholder for a statistic that does not exist should look broken, because it is: showing a
     * confident zero for a typo is how an operator spends an afternoon wondering why a counter never
     * moves.
     */
    private Optional<StatisticDefinition> known(String id) {
        return statistics.definition(id);
    }
}
