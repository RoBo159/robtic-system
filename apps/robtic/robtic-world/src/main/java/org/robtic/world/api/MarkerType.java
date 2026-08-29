package org.robtic.world.api;

import org.bukkit.configuration.ConfigurationSection;
import org.robtic.core.registry.Identified;
import org.robtic.core.util.Ids;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Logger;

/**
 * One kind of marker a builder can place: what it means, how many are allowed, and what it unlocks.
 *
 * <h2>A marker type carries meaning; a placed marker carries only a position</h2>
 *
 * This is the whole architecture. {@link PlacedMarker} knows where it is and what type it is, and
 * nothing else. Everything about what should <em>happen</em> there — which NPC stands on it, at
 * which building level it becomes active, whether it is required — is declared here, in
 * configuration. That is what makes "add a Mailbox marker" a config edit rather than a code change,
 * and it is why {@link #npcRole} is a role name rather than an NPC.
 *
 * <h2>What the validator reads</h2>
 *
 * {@link #cardinality} and {@link #required} between them express every count rule the system has —
 * missing origin, duplicate origin, missing seller, duplicate NPC slot. A type invented later is
 * checked by the same code with no edit, because the rule lives in the data.
 *
 * @param id           lowercase, stable, written into placed markers and never shown to a player
 * @param categoryId   which tab of the marker menu this appears under
 * @param display      shown in the menu and on the placed block; {@code &} colour codes allowed
 * @param description  lines under the name in the menu, explaining what a builder should do with it
 * @param icon         material name for the menu entry
 * @param modelData    custom model data for the menu entry, for a resource pack; 0 for none
 * @param cardinality  how many may appear in one structure
 * @param required     whether a structure missing this one fails validation
 * @param level        building level at which this marker becomes active; 0 means from the start
 * @param npcRole      the configured NPC role spawned here, or empty when this is not an NPC marker
 * @param bounds       whether this type defines a corner of the structure region
 * @param metadataKeys metadata keys this type understands; anything else on a placed marker is
 *                     reported as unrecognised rather than silently ignored
 * @param defaults     metadata written onto a freshly created marker item
 */
public record MarkerType(
        String id,
        String categoryId,
        String display,
        List<String> description,
        String icon,
        int modelData,
        MarkerCardinality cardinality,
        boolean required,
        int level,
        String npcRole,
        Bounds bounds,
        Set<String> metadataKeys,
        Map<String, String> defaults
) implements Identified {

    /**
     * Whether a type marks a corner of the structure's region.
     *
     * Expressed as a property rather than by recognising two well-known ids, so the two corner
     * markers are as replaceable as every other type and a server that renames them keeps a working
     * region. It also means the validator's "this marker is outside the structure" rule can exempt
     * the two markers that define what "inside" means without naming them.
     */
    public enum Bounds {

        /** An ordinary marker. Must sit inside the region the corners define. */
        NONE,

        /** One corner of the region. */
        ORIGIN,

        /** The opposite corner. */
        END;

        public boolean corner() {
            return this != NONE;
        }

        static Bounds parse(String raw, String where, Logger logger) {
            if (raw == null || raw.isBlank()) {
                return NONE;
            }

            try {
                return valueOf(raw.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException unknown) {
                logger.warning(where + ": unknown bounds \"" + raw
                        + "\", treating as an ordinary marker. Valid values are origin, end, none.");
                return NONE;
            }
        }
    }

    public MarkerType {
        id = Ids.normalise(id);
        categoryId = Ids.normalise(categoryId);
        description = List.copyOf(description);
        metadataKeys = Set.copyOf(metadataKeys);
        defaults = Map.copyOf(defaults);
    }

    /** Whether placing this marker is meant to result in an NPC. */
    public boolean spawnsNpc() {
        return npcRole != null && !npcRole.isBlank();
    }

    /** Whether this marker is active at a given building level. */
    public boolean activeAt(int buildingLevel) {
        return buildingLevel >= level;
    }

    /**
     * Reads one marker type.
     *
     * Tolerant everywhere it can be: a bad cardinality, a bad bounds value or a missing display each
     * fall back to something usable and warn. The one refusal is an unusable id, because a type
     * nothing can address is a type no marker can ever be.
     */
    public static Optional<MarkerType> parse(String key, ConfigurationSection body, Logger logger) {
        String id = Ids.normalise(key);
        String where = "markers.yml → types → " + key;

        if (!Ids.valid(id)) {
            logger.warning(where + ": ignored, " + Ids.describeProblem(id) + ".");
            return Optional.empty();
        }

        if (body == null) {
            logger.warning(where + ": ignored, it has no settings under it.");
            return Optional.empty();
        }

        Set<String> metadataKeys = new LinkedHashSet<>();
        Map<String, String> defaults = new LinkedHashMap<>();

        for (String declared : body.getStringList("metadata-keys")) {
            metadataKeys.add(declared.trim().toLowerCase(Locale.ROOT));
        }

        ConfigurationSection defaultsSection = body.getConfigurationSection("defaults");

        if (defaultsSection != null) {
            for (String metaKey : defaultsSection.getKeys(false)) {
                String normalised = metaKey.trim().toLowerCase(Locale.ROOT);

                defaults.put(normalised, String.valueOf(defaultsSection.get(metaKey)));

                // A default for a key the type never declared would be written onto every item and
                // then reported as unrecognised by the validator. Declaring it implicitly is the
                // behaviour an operator means, and it keeps the two lists from drifting apart.
                metadataKeys.add(normalised);
            }
        }

        int level = Math.max(0, body.getInt("level", 0));

        return Optional.of(new MarkerType(
                id,
                body.getString("category", MarkerCategory.DEFAULT),
                body.getString("display", "&f" + id),
                body.getStringList("description"),
                body.getString("icon", "PAPER"),
                Math.max(0, body.getInt("model-data", 0)),
                MarkerCardinality.parse(body.getString("cardinality"), where, logger),
                body.getBoolean("required", false),
                level,
                body.getString("npc-role", ""),
                Bounds.parse(body.getString("bounds"), where, logger),
                metadataKeys,
                defaults));
    }
}
