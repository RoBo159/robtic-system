package org.robtic.minecraft.progression.market;

import org.bukkit.configuration.ConfigurationSection;

import java.util.Locale;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * What one item is worth, in both places a player can sell it.
 *
 * <h2>Two numbers, because there are two markets</h2>
 *
 * {@code server} is what the job's sell NPC pays — a guaranteed, instant, deliberately unexciting
 * price. {@code minimum} is the floor a player may not list below on the player market.
 *
 * They exist together in one record because the relationship between them is the entire economic
 * design, and splitting them across two config sections would let it drift. The floor sits at or
 * above the server price so that undercutting the server is impossible; if a player could list below
 * it, every listing would be bought instantly by someone flipping it straight back to the NPC, and
 * the player market would be a slow way to lose money rather than a market.
 *
 * <h2>Never negative</h2>
 *
 * A negative price is a duplication exploit, not a discount: selling an item for -10 credits the
 * player when the sign is applied somewhere downstream. Both values are clamped at parse time and
 * the mistake is reported, so no negative price can reach the transaction code at all.
 *
 * @param itemKey the material name, or a custom item id for anything this server defines itself
 * @param server  what the job's sell NPC pays per item
 * @param minimum the lowest a player may list it for. Never below {@code server}
 */
public record SellPrice(String itemKey, double server, double minimum) {

    public SellPrice {
        itemKey = itemKey == null ? "" : itemKey.trim().toUpperCase(Locale.ROOT);
        server = Math.max(0.0d, sanitise(server));
        minimum = Math.max(server, sanitise(minimum));
    }

    /**
     * Parses one entry of a job's {@code prices} section.
     *
     * Accepts both the short form ({@code DIAMOND: 50}) and the long one
     * ({@code DIAMOND: {server: 50, minimum: 60}}), because most items only ever need one number
     * and making every operator write three lines for them would make the file unreadable.
     *
     * @return empty when the value is neither a number nor a section, having warned
     */
    public static Optional<SellPrice> parse(
            ConfigurationSection section,
            String key,
            String where,
            Logger logger
    ) {
        if (section.isConfigurationSection(key)) {
            ConfigurationSection body = section.getConfigurationSection(key);
            double server = body.getDouble("server", 0.0d);

            return Optional.of(new SellPrice(key, server, body.getDouble("minimum", server)));
        }

        if (section.isDouble(key) || section.isInt(key) || section.isLong(key)) {
            double value = section.getDouble(key);

            if (value < 0.0d) {
                logger.warning(where + ": price for " + key + " is negative (" + value
                        + ") and was clamped to 0. A negative price is an exploit, not a discount.");
            }

            return Optional.of(new SellPrice(key, value, value));
        }

        logger.warning(where + ": price for " + key + " is neither a number nor a section, ignored.");
        return Optional.empty();
    }

    private static double sanitise(double value) {
        return Double.isNaN(value) || Double.isInfinite(value) ? 0.0d : value;
    }

    /** Total the server pays for a stack, saturating so an absurd price cannot overflow a balance. */
    public double serverTotal(int amount) {
        return amount <= 0 ? 0.0d : server * amount;
    }
}
