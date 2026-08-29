package org.robtic.minecraft.progression.api;

import org.robtic.minecraft.util.Ids;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.configuration.ConfigurationSection;

import java.util.Optional;

/**
 * How rare something is — a configured value, not an enum.
 *
 * <h2>Why not an enum</h2>
 *
 * Common/Rare/Epic/Legendary is the obvious set right up until the server runs a season and wants
 * "Seasonal", or sells a tier and wants "Exclusive". An enum makes that a code change and a release;
 * this makes it four lines of YAML.
 *
 * It is also deliberately not owned by the title system. A rarity is just as applicable to a pet, a
 * dungeon reward or a cosmetic, and the first of those to need it should find it already here rather
 * than defining a second, subtly different scale.
 *
 * @param id      stable identifier, e.g. {@code legendary}
 * @param display what a player sees, e.g. {@code Legendary}
 * @param color   the colour titles and GUI items of this rarity are tinted with
 * @param order   sort position; lower is commoner. Used for "sort by rarity" and nothing else
 * @param glow    whether GUI icons of this rarity carry an enchant shimmer
 */
public record Rarity(
        String id,
        String display,
        TextColor color,
        int order,
        boolean glow
) implements Identified {

    /**
     * The rarity used when a title names one that does not exist.
     *
     * A title with an unknown rarity is still a title the player earned, so it renders in grey and
     * sorts first rather than failing to load. The mistake is reported where it is detected.
     */
    public static final Rarity UNKNOWN = new Rarity("unknown", "Unknown", NamedTextColor.GRAY, 0, false);

    /**
     * Parses one entry of the {@code rarities} section.
     *
     * @param id      the section key
     * @param section the section body
     * @return empty when the section is missing entirely, so the caller can skip it quietly
     */
    public static Optional<Rarity> parse(String id, ConfigurationSection section) {
        if (section == null) {
            return Optional.empty();
        }

        TextColor color = Colors.parse(section.getString("color", "GRAY"))
                .orElse(NamedTextColor.GRAY);

        return Optional.of(new Rarity(
                Ids.normalise(id),
                section.getString("display", id),
                color,
                section.getInt("order", 0),
                section.getBoolean("glow", false)
        ));
    }
}
