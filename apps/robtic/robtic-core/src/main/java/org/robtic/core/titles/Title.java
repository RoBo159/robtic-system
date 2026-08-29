package org.robtic.core.titles;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Material;
import org.robtic.core.registry.Identified;
import org.robtic.core.registry.Rarity;
import org.robtic.core.titles.TitleSource;
import org.robtic.core.unlock.UnlockCondition;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * A title a player can own and wear.
 *
 * <h2>Titles know nothing about Jobs</h2>
 *
 * This is the rule the whole progression design rests on. A title carries a {@link TitleSource},
 * which is a configured label, and a list of {@link UnlockCondition}s, which read attributes by
 * string path. Neither of those is a reference to the job system — or to pets, dungeons or seasons.
 * Jobs depends on Titles; Titles depends on nothing.
 *
 * Concretely: {@code miner_stonebreaker} has {@code source: job} because that is where a player
 * should go to get it, and it is unlocked by the job system calling
 * {@link TitleService#unlock} at the configured level. The title itself has no idea that happened.
 *
 * <h2>Immutable, and a value</h2>
 *
 * Reloading replaces titles wholesale rather than mutating them, so a GUI holding one while a reload
 * runs renders the old definition consistently instead of a half-updated one.
 *
 * @param id          stable identifier, e.g. {@code miner_stonebreaker}
 * @param display     what a player sees, e.g. {@code Stonebreaker}. May contain {@code &} codes
 * @param color       the tint applied when the display carries no colour codes of its own
 * @param rarity      resolved rarity; {@link Rarity#UNKNOWN} when the config named one that is absent
 * @param icon        the material shown for this title in the GUI
 * @param description free text shown on the tooltip; may be several lines
 * @param priority    sort weight. Higher sorts first, so a server can float its best titles
 * @param permission  optional node that must also be held; empty means no permission is required
 * @param source      where it comes from, used for grouping, filtering and the "how to get it" line
 * @param hidden      when true it never appears in the GUI until owned — a secret or seasonal title
 * @param unlock      requirements checked before it may be equipped, beyond simply owning it
 * @param metadata    an open bag for whichever system defined this title. Never read by this package
 */
public record Title(
        String id,
        String display,
        TextColor color,
        Rarity rarity,
        Material icon,
        List<String> description,
        int priority,
        Optional<String> permission,
        TitleSource source,
        boolean hidden,
        UnlockCondition unlock,
        Map<String, String> metadata
) implements Identified {

    public Title {
        description = List.copyOf(description);
        metadata = Map.copyOf(metadata);
    }

    /**
     * The rendered name, as it appears in chat and in the GUI.
     *
     * The configured colour is applied as a fallback rather than an override, so a display that
     * already carries {@code &} codes keeps them and a plain one still gets its rarity tint. Getting
     * this the other way round would make every gradient title in the config render flat.
     */
    public Component name() {
        return org.robtic.core.util.Chat.component(display).colorIfAbsent(color);
    }

    /** Whether a permission gate applies and this player fails it. Online players only. */
    public boolean deniedByPermission(org.bukkit.entity.Player player) {
        return permission.filter(node -> !player.hasPermission(node)).isPresent();
    }

    /**
     * A metadata value, for the system that wrote it.
     *
     * Present so a future module can hang its own data off a title — a pet id, a season number —
     * without this record growing a field for every system that ever ships.
     */
    public Optional<String> meta(String key) {
        return Optional.ofNullable(metadata.get(key));
    }
}
