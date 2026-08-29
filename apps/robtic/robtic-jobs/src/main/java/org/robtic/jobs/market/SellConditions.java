package org.robtic.jobs.market;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.robtic.core.unlock.Attributes;
import org.robtic.core.unlock.UnlockCondition;
import org.robtic.core.unlock.UnlockConditions;
import org.robtic.core.unlock.UnlockContext;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What a player must satisfy before the server will buy from them.
 *
 * <h2>Reusing the unlock conditions rather than inventing sell requirements</h2>
 *
 * The spec lists minimum level, daily quota, cooldown, permission, quest completion and "custom
 * conditions". Five of those six are already expressible by {@link UnlockConditions} — a minimum
 * level is {@code attribute-at-least job.miner.level}, a permission is {@code permission}, and a
 * quest is whatever the future quest system publishes as an attribute.
 *
 * Writing a parallel condition system for selling would duplicate the parser, the combinators and
 * the descriptions, and would mean a future system had to register its logic twice to be usable in
 * both places. So this holds a plain {@link UnlockCondition} and adds only the two things that are
 * genuinely about selling and genuinely stateful: the quota and the cooldown, which live in
 * {@link SellQuotas} because they are per-player counters rather than predicates.
 *
 * @param requirement    everything expressible as a condition
 * @param dailyQuota     maximum items sold to the server per day, or 0 for unlimited
 * @param cooldownMillis minimum gap between sales, or 0 for none
 */
public record SellConditions(UnlockCondition requirement, int dailyQuota, long cooldownMillis) {

    /** No requirements at all — sell whatever, whenever. */
    public static final SellConditions NONE = new SellConditions(UnlockCondition.ALWAYS, 0, 0L);

    public SellConditions {
        dailyQuota = Math.max(0, dailyQuota);
        cooldownMillis = Math.max(0L, cooldownMillis);
    }

    public static SellConditions parse(ConfigurationSection section, UnlockConditions conditions, String where) {
        if (section == null) {
            return NONE;
        }

        List<UnlockCondition> parsed = conditions.parse(section.getList("require"), where + " → require");

        return new SellConditions(
                UnlockConditions.allOf(parsed),
                section.getInt("daily-quota", 0),
                Math.max(0L, section.getLong("cooldown-seconds", 0L)) * 1000L);
    }

    /** Whether the predicate half holds. The quota and cooldown are checked by {@link SellQuotas}. */
    public boolean satisfied(UUID playerId, Optional<Player> player, Attributes attributes) {
        return requirement.satisfied(UnlockContext.of(playerId, player, attributes));
    }

    /** What the player still has to do, for the refusal message. */
    public String describe() {
        return requirement.describe();
    }
}
