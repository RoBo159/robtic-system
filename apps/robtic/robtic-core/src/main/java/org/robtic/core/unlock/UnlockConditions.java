package org.robtic.core.unlock;

import org.robtic.core.registry.Registry;
import org.robtic.core.util.Ids;
import org.bukkit.configuration.ConfigurationSection;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.OptionalDouble;
import java.util.logging.Logger;

/**
 * The registry of condition types, and the parser that turns a config list into conditions.
 *
 * <h2>Built-in types</h2>
 *
 * <pre>
 *   attribute-at-least   path, value      a number published by any system reaches a threshold
 *   attribute-equals     path, value      a string published by any system matches
 *   permission           node             the player holds a permission (online only)
 *   all-of               conditions       every nested condition holds
 *   any-of               conditions       at least one nested condition holds
 *   not                  condition        the nested condition does not hold
 *   always               —                unconditional; useful as a starter title
 * </pre>
 *
 * None of them mention jobs, titles, pets or anything else. {@code attribute-at-least} with a path
 * of {@code job.miner.level} is how "Miner level 10" is expressed, and the same type with
 * {@code pet.dragon.level} will express a pet requirement without a line changing here.
 *
 * <h2>A missing attribute is not zero</h2>
 *
 * {@code attribute-at-least} fails when the attribute is absent, even against a threshold of 0.
 * Absent means "no system claims to know", and treating that as zero would silently unlock every
 * {@code >= 0} title on a server where the publishing module is switched off.
 */
public final class UnlockConditions {

    private final Registry<UnlockConditionType> types;
    private final Logger logger;

    public UnlockConditions(Logger logger) {
        this.types = new Registry<>("unlock condition type", logger);
        this.logger = logger;
        registerBuiltIns();
    }

    /** Adds a type. Called by any module that wants logic the built-ins cannot express. */
    public void register(UnlockConditionType type) {
        types.register(type);
    }

    /**
     * Parses the {@code unlock} list of a title (or anything else that gates on conditions).
     *
     * @param list  the raw list from config; null or empty yields no conditions at all
     * @param where a human-readable location for warnings, e.g. {@code titles.yml → miner_prospector}
     * @return the parsed conditions. An entry that fails to parse is warned about and omitted; see
     *         {@link #allOf} for what an empty result then means
     */
    public List<UnlockCondition> parse(List<?> list, String where) {
        List<UnlockCondition> parsed = new ArrayList<>();

        if (list == null) {
            return parsed;
        }

        for (Object element : list) {
            if (!(element instanceof java.util.Map<?, ?> map)) {
                logger.warning(where + ": an unlock entry is not a section and was ignored.");
                continue;
            }

            parse(sectionOf(map), where).ifPresent(parsed::add);
        }

        return parsed;
    }

    /** Parses a single condition section. */
    public Optional<UnlockCondition> parse(ConfigurationSection section, String where) {
        if (section == null) {
            return Optional.empty();
        }

        String typeId = Ids.normalise(section.getString("type", ""));
        Optional<UnlockConditionType> type = types.find(typeId);

        if (type.isEmpty()) {
            logger.warning(where + ": unknown unlock condition type \"" + typeId
                    + "\". Known types are " + String.join(", ", types.ids()) + ".");
            return Optional.empty();
        }

        List<String> problems = new ArrayList<>();
        Optional<UnlockCondition> condition = type.get().create(section, problems::add);

        problems.forEach(problem -> logger.warning(where + " (" + typeId + "): " + problem));

        return condition;
    }

    /**
     * Combines conditions into the single one a caller evaluates.
     *
     * An empty list means unlocked. That is the correct reading of a title with no {@code unlock}
     * block — it is granted by whatever system awards it, and has no extra requirement of its own —
     * and it is what makes job milestone titles work: the job system grants them at a level, so the
     * title itself needs no condition.
     */
    public static UnlockCondition allOf(List<UnlockCondition> conditions) {
        if (conditions.isEmpty()) {
            return UnlockCondition.ALWAYS;
        }

        if (conditions.size() == 1) {
            return conditions.get(0);
        }

        List<UnlockCondition> copy = List.copyOf(conditions);

        return UnlockCondition.of(
                copy.stream().map(UnlockCondition::describe).reduce((a, b) -> a + ", " + b).orElse(""),
                context -> copy.stream().allMatch(condition -> condition.satisfied(context)));
    }

    // ─── Built-in types ───────────────────────────────────────────────────────────────────────

    private void registerBuiltIns() {
        register(type("always", (section, problems) -> Optional.of(UnlockCondition.ALWAYS)));

        register(type("attribute-at-least", (section, problems) -> {
            String path = section.getString("path", "");
            if (path.isBlank()) {
                problems.report("\"path\" is required, e.g. job.miner.level");
                return Optional.empty();
            }

            if (!section.isSet("value")) {
                problems.report("\"value\" is required");
                return Optional.empty();
            }

            double threshold = section.getDouble("value");
            String text = section.getString("describe", path + " ≥ " + trim(threshold));

            return Optional.of(UnlockCondition.of(text, context -> {
                OptionalDouble actual = context.number(path);
                // Absent is a failure, never a zero — see the class comment.
                return actual.isPresent() && actual.getAsDouble() >= threshold;
            }));
        }));

        register(type("attribute-equals", (section, problems) -> {
            String path = section.getString("path", "");
            String expected = section.getString("value", "");

            if (path.isBlank() || expected.isBlank()) {
                problems.report("both \"path\" and \"value\" are required");
                return Optional.empty();
            }

            String text = section.getString("describe", path + " = " + expected);

            return Optional.of(UnlockCondition.of(text,
                    context -> context.text(path).filter(expected::equalsIgnoreCase).isPresent()));
        }));

        register(type("permission", (section, problems) -> {
            String node = section.getString("node", "");

            if (node.isBlank()) {
                problems.report("\"node\" is required");
                return Optional.empty();
            }

            String text = section.getString("describe", "Requires " + node);

            // Offline evaluation cannot answer this, so it reports "not met" rather than guessing.
            // A GUI listing an offline player's titles shows it locked, which is the safe direction.
            return Optional.of(UnlockCondition.of(text,
                    context -> context.player().map(player -> player.hasPermission(node)).orElse(false)));
        }));

        register(type("all-of", (section, problems) ->
                nested(section, problems, list -> UnlockCondition.of(
                        join(list, " and "),
                        context -> list.stream().allMatch(condition -> condition.satisfied(context))))));

        register(type("any-of", (section, problems) ->
                nested(section, problems, list -> UnlockCondition.of(
                        join(list, " or "),
                        context -> list.stream().anyMatch(condition -> condition.satisfied(context))))));

        register(type("not", (section, problems) -> {
            ConfigurationSection inner = section.getConfigurationSection("condition");

            if (inner == null) {
                problems.report("\"condition\" is required");
                return Optional.empty();
            }

            return parse(inner, "not").map(condition ->
                    UnlockCondition.of("not (" + condition.describe() + ")",
                            context -> !condition.satisfied(context)));
        }));
    }

    /** Shared parsing for the two combinators, which differ only in how they fold the results. */
    private Optional<UnlockCondition> nested(
            ConfigurationSection section,
            UnlockConditionType.ConditionProblems problems,
            java.util.function.Function<List<UnlockCondition>, UnlockCondition> combine
    ) {
        List<?> raw = section.getList("conditions");

        if (raw == null || raw.isEmpty()) {
            problems.report("\"conditions\" must be a non-empty list");
            return Optional.empty();
        }

        List<UnlockCondition> parsed = parse(raw, "nested condition");

        return parsed.isEmpty() ? Optional.empty() : Optional.of(combine.apply(List.copyOf(parsed)));
    }

    private static String join(List<UnlockCondition> conditions, String separator) {
        return conditions.stream()
                .map(UnlockCondition::describe)
                .reduce((a, b) -> a + separator + b)
                .orElse("");
    }

    /** Renders 10.0 as "10" and 10.5 as "10.5", so thresholds read naturally in the GUI. */
    private static String trim(double value) {
        return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
    }

    /**
     * Adapts a raw map from a YAML list into a {@link ConfigurationSection}.
     *
     * Bukkit hands nested list entries back as maps rather than sections, so this is the bridge that
     * lets the condition types take a section regardless of whether they were reached through a list
     * or a named key.
     */
    private static ConfigurationSection sectionOf(java.util.Map<?, ?> map) {
        org.bukkit.configuration.MemoryConfiguration configuration =
                new org.bukkit.configuration.MemoryConfiguration();

        map.forEach((key, value) -> configuration.set(String.valueOf(key), value));

        return configuration;
    }

    private static UnlockConditionType type(String id, Factory factory) {
        return new UnlockConditionType() {
            @Override
            public String id() {
                return id;
            }

            @Override
            public Optional<UnlockCondition> create(ConfigurationSection section, ConditionProblems problems) {
                return factory.create(section, problems);
            }
        };
    }

    @FunctionalInterface
    private interface Factory {
        Optional<UnlockCondition> create(ConfigurationSection section, UnlockConditionType.ConditionProblems problems);
    }
}
