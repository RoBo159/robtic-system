package org.robtic.dragonbattle.dragon;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.Perch;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Chooses where the dragon lands.
 *
 * <h2>The dragon never picks its own ground</h2>
 *
 * Vanilla lands on the portal and nowhere else. A dragon free to choose terrain would settle inside
 * a build, on a roof, or somewhere players cannot reach — so every landing here resolves to a perch
 * an operator placed, and when none qualifies the answer is "keep flying" rather than "land
 * anyway". That is the single rule this class exists to enforce.
 *
 * <h2>Two modes, one selection</h2>
 *
 * <ul>
 *   <li><b>Player landing</b> — pick a player, then the nearest perch within its radius. This is
 *       what makes the dragon feel like it is coming for someone.</li>
 *   <li><b>Perch landing</b> — pick any eligible perch by weight, ignoring where players are.</li>
 * </ul>
 *
 * Player landing is tried first when the arena prefers it, and falls back to the second rather than
 * failing: a player standing far from every perch should not stop the dragon landing at all.
 *
 * <h2>Cooldowns are per battle, not per perch</h2>
 *
 * Held here, keyed by perch id, and cleared when a battle ends. A cooldown that outlived its battle
 * would mean the second fight in an arena started with half its perches unavailable for reasons
 * nobody watching could see.
 */
public final class PerchSelector {

    /** Perch id → the tick at which it becomes available again. */
    private final Map<String, Long> cooldowns = new ConcurrentHashMap<>();

    /**
     * Picks a perch to land on, or empty when the dragon should stay airborne.
     *
     * @param candidates players worth landing near — usually those in the arena's world
     * @param now        the server tick, for cooldown arithmetic
     */
    public Optional<Perch> select(Arena arena, List<Player> candidates, long now) {
        List<Perch> eligible = eligible(arena, now);

        if (eligible.isEmpty()) {
            return Optional.empty();
        }

        if (arena.settings().preferPlayerLanding() && !candidates.isEmpty()) {
            Optional<Perch> nearPlayer = nearestToRandomPlayer(eligible, candidates);
            if (nearPlayer.isPresent()) {
                return nearPlayer;
            }
        }

        return byWeight(eligible);
    }

    /** Perches that are off cooldown, carry a usable weight, and whose world is loaded. */
    private List<Perch> eligible(Arena arena, long now) {
        List<Perch> eligible = new ArrayList<>();

        for (Perch perch : arena.perches()) {
            // Weight zero is how an operator disables a perch without deleting it, so it is excluded
            // here rather than being allowed through to a weighted pick that could never choose it.
            if (perch.weight() <= 0) {
                continue;
            }

            if (now < cooldowns.getOrDefault(perch.id(), 0L)) {
                continue;
            }

            if (perch.location().toBukkit().isEmpty()) {
                continue;
            }

            eligible.add(perch);
        }

        return eligible;
    }

    /**
     * Picks a player at random, then the closest perch that considers itself near them.
     *
     * At random rather than "the closest player": always choosing the nearest would let one player
     * monopolise the dragon by standing closest, and the fight reads better when it threatens people
     * in turn.
     */
    private Optional<Perch> nearestToRandomPlayer(List<Perch> eligible, List<Player> candidates) {
        Player target = candidates.get(ThreadLocalRandom.current().nextInt(candidates.size()));
        Location where = target.getLocation();

        Perch best = null;
        double bestDistance = Double.MAX_VALUE;

        for (Perch perch : eligible) {
            Optional<Location> position = perch.location().toBukkit();
            if (position.isEmpty() || !position.get().getWorld().equals(where.getWorld())) {
                continue;
            }

            double distance = position.get().distance(where);

            // The perch's own radius decides what "near" means, so an operator can make one perch
            // cover a wide area and another only trigger when somebody is on top of it.
            if (distance <= perch.radius() && distance < bestDistance) {
                best = perch;
                bestDistance = distance;
            }
        }

        return Optional.ofNullable(best);
    }

    /** A weighted pick. Higher weight is proportionally more likely. */
    private Optional<Perch> byWeight(List<Perch> eligible) {
        double total = eligible.stream().mapToDouble(Perch::weight).sum();

        if (total <= 0) {
            return Optional.empty();
        }

        double roll = ThreadLocalRandom.current().nextDouble(total);

        for (Perch perch : eligible) {
            roll -= perch.weight();
            if (roll <= 0) {
                return Optional.of(perch);
            }
        }

        // Only reachable through floating-point drift on the last comparison.
        return Optional.of(eligible.get(eligible.size() - 1));
    }

    /** Starts a perch's cooldown. Called when the dragon actually lands, not when one is chosen. */
    public void markUsed(Perch perch, long now) {
        cooldowns.put(perch.id(), now + perch.cooldownTicks());
    }

    /** Clears every cooldown. Called when a battle ends, so the next one starts clean. */
    public void reset() {
        cooldowns.clear();
    }
}
