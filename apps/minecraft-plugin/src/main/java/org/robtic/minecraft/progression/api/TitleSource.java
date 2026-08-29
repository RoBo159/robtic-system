package org.robtic.minecraft.progression.api;

import org.robtic.minecraft.util.Ids;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;

import java.util.Optional;

/**
 * Where a title came from — Job, Premium, Achievement, Dungeon, Pet, Season, Event, Staff, Custom.
 *
 * <h2>Unlimited, and defined in YAML</h2>
 *
 * The spec lists nine examples and the system supports any number, because the list is guaranteed to
 * grow: this server already has plans for pets, dungeons and seasons, none of which exist yet. An
 * enum would mean every one of those ships with a compile-time edit to the title system — exactly
 * the coupling the title system is supposed to be free of.
 *
 * So a source is a registry entry like everything else. A future Pets plugin adds
 * {@code pet: {display: "Pet", icon: BONE}} to {@code titles.yml} and its titles filter, sort and
 * render correctly with no code in this package changing at all.
 *
 * <h2>What a source is not</h2>
 *
 * It is not an owner and it is not an authority. Nothing asks a source whether a player has earned
 * a title; sources exist so the GUI can group and filter, and so a player reading a locked title can
 * be told where to go and get it. Unlocking is {@link UnlockCondition}'s job.
 *
 * @param id          stable identifier, e.g. {@code job}
 * @param display     shown in the GUI filter and on a title's tooltip, e.g. {@code Job}
 * @param icon        the material representing this source in the filter menu
 * @param description one line telling a player how titles from this source are generally obtained
 */
public record TitleSource(
        String id,
        String display,
        Material icon,
        String description
) implements Identified {

    /**
     * Used when a title names a source that is not defined.
     *
     * The title still loads. A missing source makes it harder to categorise, not impossible to own,
     * and refusing to load a title an operator has already granted to players would be the more
     * destructive of the two failures.
     */
    public static final TitleSource UNKNOWN =
            new TitleSource("unknown", "Unknown", Material.PAPER, "Source unknown.");

    public static Optional<TitleSource> parse(String id, ConfigurationSection section) {
        if (section == null) {
            return Optional.empty();
        }

        Material icon = Optional.ofNullable(Material.matchMaterial(section.getString("icon", "PAPER")))
                .orElse(Material.PAPER);

        return Optional.of(new TitleSource(
                Ids.normalise(id),
                section.getString("display", id),
                icon,
                section.getString("description", "")
        ));
    }
}
