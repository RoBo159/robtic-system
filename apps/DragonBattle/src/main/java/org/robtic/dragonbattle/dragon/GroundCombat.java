package org.robtic.dragonbattle.dragon;

import org.bukkit.Location;
import org.bukkit.Particle;
import org.robtic.dragonbattle.util.Particles;
import org.bukkit.Sound;
import org.bukkit.entity.EnderDragon;
import org.bukkit.entity.Player;
import org.bukkit.util.Vector;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * What a perched dragon does to the people standing around it.
 *
 * <h2>Why bite and tail are written by hand</h2>
 *
 * The dragon's own phases cover roaring and breathing, and those are used as they are — vanilla
 * already does them well and a reimplementation would look worse. It has no bite and no tail sweep:
 * a landed vanilla dragon simply breathes at you. Those two therefore have to be real code, and are
 * the only combat this plugin simulates rather than delegates.
 *
 * <h2>Arcs, not radii</h2>
 *
 * A bite hits in front and a tail sweep hits behind, both as arcs rather than circles. That is what
 * makes position matter: standing behind a dragon should be a different risk from standing in front
 * of it, and a plain radius would make the two attacks identical apart from their names.
 */
public final class GroundCombat {

    /** How the four attacks are chosen between. Weighted, so the fight is not a fixed rotation. */
    public enum Attack {
        BITE,
        TAIL,
        BREATH,
        ROAR
    }

    private final Settings settings;

    public GroundCombat(Settings settings) {
        this.settings = settings;
    }

    /** Tuning, read from battle.yml so no number here is fixed. */
    public record Settings(
            double biteDamage,
            double biteReach,
            double biteArcDegrees,
            double tailDamage,
            double tailReach,
            double tailArcDegrees,
            double tailKnockback
    ) {
        public static Settings defaults() {
            return new Settings(8.0, 7.0, 90.0, 6.0, 9.0, 120.0, 1.4);
        }
    }

    /**
     * Performs one attack.
     *
     * @return the attack chosen, so the caller can drive the dragon's phase to match
     */
    public Attack perform(EnderDragon dragon, List<Player> nearby) {
        Attack attack = choose();

        switch (attack) {
            case BITE -> bite(dragon, nearby);
            case TAIL -> tail(dragon, nearby);
            // Breath and roar are the entity's own animations; the caller sets the phase and vanilla
            // does the rest, including the damage.
            case BREATH, ROAR -> {
            }
        }

        return attack;
    }

    /**
     * Weighted rather than uniform.
     *
     * Roar is the most common because it is the telegraph — a fight where every action was a hit
     * would give players nothing to read, and the pause is what makes the other three feel earned.
     */
    private Attack choose() {
        int roll = ThreadLocalRandom.current().nextInt(100);

        if (roll < 30) {
            return Attack.ROAR;
        }
        if (roll < 55) {
            return Attack.BITE;
        }
        if (roll < 80) {
            return Attack.BREATH;
        }
        return Attack.TAIL;
    }

    /** A short, hard hit in the arc the dragon is facing. */
    private void bite(EnderDragon dragon, List<Player> nearby) {
        Location head = dragon.getLocation();

        head.getWorld().playSound(head, Sound.ENTITY_ENDER_DRAGON_HURT, 2f, 0.6f);
        Particles.spawn(head.getWorld(), Particle.CRIT, head.clone().add(0, 2, 0), 40, 1.5, 1, 1.5, 0.3);

        for (Player player : inArc(dragon, nearby, settings.biteReach(), settings.biteArcDegrees(), true)) {
            player.damage(settings.biteDamage(), dragon);
        }
    }

    /**
     * A wide sweep behind the dragon, which throws rather than crushes.
     *
     * Less damage than a bite and far more knockback: the tail is what stops players parking behind
     * the dragon and hitting it with impunity, and being thrown is a more interesting punishment
     * than being hurt.
     */
    private void tail(EnderDragon dragon, List<Player> nearby) {
        Location base = dragon.getLocation();

        base.getWorld().playSound(base, Sound.ENTITY_ENDER_DRAGON_FLAP, 2f, 0.5f);
        Particles.spawn(base.getWorld(), Particle.SWEEP_ATTACK, base.clone().add(0, 1, 0), 20, 3, 1, 3, 0);

        for (Player player : inArc(dragon, nearby, settings.tailReach(), settings.tailArcDegrees(), false)) {
            player.damage(settings.tailDamage(), dragon);

            // Away from the dragon and upward, so the hit reads as being swept rather than nudged.
            Vector away = player.getLocation().toVector()
                    .subtract(base.toVector())
                    .setY(0);

            if (away.lengthSquared() > 0) {
                away.normalize().multiply(settings.tailKnockback()).setY(0.5);
                player.setVelocity(away);
            }
        }
    }

    /**
     * Players within reach and inside the arc.
     *
     * @param inFront true for the arc the dragon faces, false for the one behind it
     */
    private List<Player> inArc(EnderDragon dragon, List<Player> nearby, double reach, double arcDegrees, boolean inFront) {
        Location origin = dragon.getLocation();
        Vector facing = origin.getDirection().setY(0).normalize();

        double halfArc = Math.toRadians(arcDegrees / 2);
        double reachSquared = reach * reach;

        return nearby.stream()
                .filter(player -> player.getWorld().equals(origin.getWorld()))
                .filter(player -> player.getLocation().distanceSquared(origin) <= reachSquared)
                .filter(player -> {
                    Vector towards = player.getLocation().toVector().subtract(origin.toVector()).setY(0);

                    if (towards.lengthSquared() == 0) {
                        // Standing exactly on the dragon. Counts as in front, because "inside the
                        // boss" should never be the safest place to be.
                        return inFront;
                    }

                    double angle = facing.angle(towards.normalize());

                    return inFront ? angle <= halfArc : angle >= Math.PI - halfArc;
                })
                .toList();
    }
}
