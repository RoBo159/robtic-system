package org.robtic.jobs.workspace.lifecycle;

import org.bukkit.configuration.ConfigurationSection;
import org.robtic.core.util.Ids;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Predicate;
import java.util.logging.Logger;

/**
 * Which trade an abandoned building takes up next.
 *
 * <h2>Why this exists at all</h2>
 *
 * Every workspace uses the same building. Only the profession differs — so when a business is
 * abandoned, the building does not need replacing, it needs <em>reassigning</em>. The next player to
 * find it should not be able to predict what they will get, and over a server's lifetime the mix of
 * trades in the world should be something the operator chose.
 *
 * <h2>Weighted, and never equal by accident</h2>
 *
 * The brief is explicit that equal chances must not be hard-coded, and the reason is economic rather
 * than aesthetic: professions are not equally valuable, equally easy or equally in demand. A server
 * that wants miners common and hunters rare says so here, and nothing in the code has an opinion.
 *
 * A weight of zero excludes a profession from reassignment without deleting it — which is how a
 * trade is retired from the wild while existing owners keep theirs.
 */
public final class ProfessionWeights {

    /** profession id → weight. Zero and negative are dropped on the way in. */
    private final Map<String, Double> weights;

    private ProfessionWeights(Map<String, Double> weights) {
        this.weights = Map.copyOf(weights);
    }

    public static ProfessionWeights empty() {
        return new ProfessionWeights(Map.of());
    }

    /**
     * Reads the {@code abandonment → professions} section.
     *
     * @param known whether a profession exists, so a weight naming one that was renamed out from
     *              under it is reported rather than silently making the roll less likely to pick
     *              anything
     */
    public static ProfessionWeights parse(
            ConfigurationSection section,
            Predicate<String> known,
            Logger logger
    ) {
        Map<String, Double> weights = new LinkedHashMap<>();

        if (section == null) {
            return empty();
        }

        for (String key : section.getKeys(false)) {
            String id = Ids.normalise(key);
            double weight = section.getDouble(key, 0d);

            if (weight <= 0d) {
                // Not an error. Zero is the documented way to retire a trade from reassignment.
                continue;
            }

            if (!known.test(id)) {
                logger.warning("workspace.yml → abandonment → professions names \"" + id + "\","
                        + " which jobs.yml does not define. It was ignored, so abandoned buildings"
                        + " will never be reassigned to it.");
                continue;
            }

            weights.put(id, weight);
        }

        if (weights.isEmpty()) {
            logger.warning("workspace.yml → abandonment → professions lists no usable profession."
                    + " Abandoned buildings will be released rather than reassigned, and an operator"
                    + " will have to rescan the structure to place a recruiter.");
        }

        return new ProfessionWeights(weights);
    }

    public boolean isEmpty() {
        return weights.isEmpty();
    }

    /** Every profession that can be rolled, for the config check and the admin command. */
    public Map<String, Double> all() {
        return weights;
    }

    /**
     * Rolls one profession.
     *
     * <h2>The exclusion is the interesting part</h2>
     *
     * {@code exclude} is the trade the building just had. Handing the next owner the same profession
     * the last one abandoned is technically correct and reads as broken — the building visibly did
     * not change, and a player who watched the previous owner lose it sees nothing happen.
     *
     * It is a preference rather than a rule: a server with one profession configured must still be
     * able to reassign, so if excluding leaves nothing, the exclusion is dropped.
     *
     * @return empty only when nothing at all is configured
     */
    public Optional<String> roll(String exclude) {
        if (weights.isEmpty()) {
            return Optional.empty();
        }

        Optional<String> different = pick(entry -> !entry.getKey().equals(exclude));

        return different.isPresent() ? different : pick(entry -> true);
    }

    private Optional<String> pick(Predicate<Map.Entry<String, Double>> eligible) {
        List<Map.Entry<String, Double>> candidates = new ArrayList<>();
        double total = 0d;

        for (Map.Entry<String, Double> entry : weights.entrySet()) {
            if (eligible.test(entry)) {
                candidates.add(entry);
                total += entry.getValue();
            }
        }

        if (candidates.isEmpty() || total <= 0d) {
            return Optional.empty();
        }

        double roll = ThreadLocalRandom.current().nextDouble(total);

        for (Map.Entry<String, Double> candidate : candidates) {
            roll -= candidate.getValue();

            if (roll < 0d) {
                return Optional.of(candidate.getKey());
            }
        }

        // Floating-point accumulation can leave the roll a hair above the total. The last candidate
        // is the correct answer, and returning empty here would make abandonment fail at random.
        return Optional.of(candidates.get(candidates.size() - 1).getKey());
    }
}
