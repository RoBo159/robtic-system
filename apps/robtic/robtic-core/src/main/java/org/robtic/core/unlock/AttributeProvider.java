package org.robtic.core.unlock;

import java.util.Optional;
import java.util.OptionalDouble;
import java.util.UUID;

/**
 * Publishes one system's numbers and strings so other systems can read them without knowing it.
 *
 * <h2>The seam that keeps Titles free of Jobs</h2>
 *
 * A title unlocks at "Miner level 10". Written directly, that sentence puts the job system inside
 * the title system, and every future unlock — pet level, dungeon clears, season rank — adds another
 * import and another {@code if}. The title system would slowly become the place that knows about
 * every other system, which is the God class this design is trying not to grow.
 *
 * Instead the job system publishes {@code job.miner.level} through one of these, and the title reads
 * an attribute path it never interprets. Jobs depends on Titles; Titles depends on nothing. When
 * Pets arrives it registers {@code pet.*} and its titles work immediately, with no edit here.
 *
 * <h2>Contract</h2>
 *
 * Implementations are asked on the server tick — a GUI redraw resolves one of these per locked title
 * — so every method must be a memory read. Never touch the network, never touch disk, never block.
 * Return empty rather than a default: {@link Attributes} cannot tell a real zero from a missing
 * value if the provider invents one, and "level 0" satisfies a condition that "unknown" should not.
 */
public interface AttributeProvider {

    /**
     * The first segment of the paths this provider answers, e.g. {@code job}.
     *
     * One namespace per provider, and {@link Attributes} refuses a second registration for the same
     * one — two systems answering {@code job.miner.level} differently is a bug that would surface as
     * titles unlocking inconsistently, which is close to impossible to diagnose from a report.
     */
    String namespace();

    /**
     * A numeric attribute, or empty when this provider has no value for it.
     *
     * @param player the player being asked about
     * @param path   the path with the namespace already stripped, e.g. {@code miner.level}
     */
    OptionalDouble number(UUID player, String path);

    /**
     * A textual attribute, or empty when this provider has no value for it.
     *
     * Separate from {@link #number} rather than everything being a string, because the conditions
     * that matter are overwhelmingly numeric comparisons and making those parse a string on every
     * GUI redraw would be work done thousands of times to no purpose.
     */
    default Optional<String> text(UUID player, String path) {
        return Optional.empty();
    }
}
