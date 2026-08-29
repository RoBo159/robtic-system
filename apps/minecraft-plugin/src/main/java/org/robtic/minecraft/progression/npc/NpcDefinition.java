package org.robtic.minecraft.progression.npc;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.EntityType;
import org.robtic.minecraft.progression.api.Identified;
import org.robtic.minecraft.util.Ids;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * What one NPC looks like and what it does when clicked.
 *
 * <h2>Kind, not class</h2>
 *
 * There is no {@code RecruiterNpc} or {@code SellerNpc} type. An NPC is this record plus a
 * {@link Kind} telling the interaction listener which behaviour to run, so adding an NPC is YAML —
 * the same rule the job system follows.
 *
 * @param id          stable identifier referenced by jobs, e.g. {@code miner_recruiter}
 * @param kind        what clicking it does
 * @param type        the entity used to represent it
 * @param name        floating name above its head; may contain {@code &} codes
 * @param subtitle    optional second line, e.g. "Right-click to join"
 * @param profession  villager profession, when {@link #type} is a villager. Ignored otherwise
 * @param jobId       the job this NPC recruits for or serves. Empty for a generic one
 * @param glowing     whether it glows, so it can be found in a dark structure
 * @param lookAtPlayers whether it turns to face nearby players
 */
public record NpcDefinition(
        String id,
        Kind kind,
        EntityType type,
        String name,
        List<String> subtitle,
        String profession,
        String jobId,
        boolean glowing,
        boolean lookAtPlayers
) implements Identified {

    /** What an NPC is for. The interaction listener dispatches on this and nothing else. */
    public enum Kind {
        /** Offers a job at a discovered structure. Disappears once somebody claims it. */
        RECRUITER,
        /** Buys a job's output at the owner's workplace. */
        SELLER,
        /** Purely decorative. Exists so a structure can be populated without every mob being clickable. */
        DECORATION
    }

    public NpcDefinition {
        subtitle = List.copyOf(subtitle);
    }

    public static Optional<NpcDefinition> parse(String key, ConfigurationSection body, Logger logger) {
        String id = Ids.normalise(key);
        String where = "npc.yml → " + id;

        if (!Ids.valid(id)) {
            logger.warning(where + ": " + Ids.describeProblem(id) + ".");
            return Optional.empty();
        }

        Kind kind;

        try {
            kind = Kind.valueOf(body.getString("kind", "RECRUITER").trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            logger.warning(where + ": unknown kind \"" + body.getString("kind")
                    + "\". Valid kinds are RECRUITER, SELLER, DECORATION. Using DECORATION so it "
                    + "does nothing rather than the wrong thing.");
            kind = Kind.DECORATION;
        }

        EntityType type = entityType(body.getString("type", "VILLAGER"), where, logger);

        return Optional.of(new NpcDefinition(
                id,
                kind,
                type,
                body.getString("name", id),
                subtitle(body),
                body.getString("profession", "NONE"),
                Ids.normalise(body.getString("job", "")),
                body.getBoolean("glowing", false),
                body.getBoolean("look-at-players", true)));
    }

    /**
     * Resolves the entity type, refusing ones that cannot work as a standing NPC.
     *
     * A player type cannot be spawned this way at all, and a non-living one cannot be made
     * invulnerable or given a name plate — both would produce an NPC that silently misbehaves rather
     * than one that visibly fails, so they are rejected at load with an explanation.
     */
    private static EntityType entityType(String raw, String where, Logger logger) {
        EntityType fallback = EntityType.VILLAGER;

        try {
            EntityType type = EntityType.valueOf(raw.trim().toUpperCase(Locale.ROOT));

            if (type == EntityType.PLAYER) {
                logger.warning(where + ": PLAYER cannot be used as an NPC type. Using VILLAGER.");
                return fallback;
            }

            if (type.getEntityClass() == null
                    || !org.bukkit.entity.LivingEntity.class.isAssignableFrom(type.getEntityClass())) {
                logger.warning(where + ": " + type + " is not a living entity and cannot be an NPC. "
                        + "Using VILLAGER.");
                return fallback;
            }

            return type;
        } catch (IllegalArgumentException unknown) {
            logger.warning(where + ": unknown entity type \"" + raw + "\". Using VILLAGER.");
            return fallback;
        }
    }

    private static List<String> subtitle(ConfigurationSection body) {
        if (body.isList("subtitle")) {
            return List.copyOf(body.getStringList("subtitle"));
        }

        String single = body.getString("subtitle", "");
        return single.isBlank() ? List.of() : List.of(single);
    }
}
