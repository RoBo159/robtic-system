package org.robtic.jobs.workspace;

import org.bukkit.configuration.ConfigurationSection;
import org.robtic.core.registry.Identified;
import org.robtic.core.util.Ids;

import java.util.Optional;
import java.util.logging.Logger;

/**
 * A job an NPC does at a workspace.
 *
 * <h2>Registered, not enumerated</h2>
 *
 * The brief names two roles today and six more that are coming — contract, event, decoration,
 * merchant, assistant, visitor. An enum would make each of those a code change to this file, and the
 * point of the workspace being a foundation is that the systems built on it do not have to edit it.
 *
 * So a role is a registry entry. A future contracts module registers {@code contract}, adds itself
 * as its {@link Handler}, lists the role in a tier's {@code npcs}, and its NPC appears at every
 * workspace of that tier — with nothing in this package changing.
 *
 * <h2>Placement is relative to the anchor</h2>
 *
 * Several NPCs stand in one building, so they cannot all be at the marker. Each role carries an
 * offset, which is what stops the upgrade NPC spawning inside the seller.
 *
 * @param id         stable identifier, e.g. {@code seller}
 * @param display    shown where a role has to be named to a player
 * @param npcId      the {@code npc.yml} definition spawned for this role, when a job does not
 *                   override it
 * @param offsetX    where it stands, relative to the workspace anchor
 * @param offsetY    vertical offset from the anchor
 * @param offsetZ    where it stands, relative to the workspace anchor
 * @param suspendable whether unpaid tax disables it. A decoration should not vanish over a tax bill
 */
public record WorkspaceNpcRole(
        String id,
        String display,
        String npcId,
        double offsetX,
        double offsetY,
        double offsetZ,
        boolean suspendable
) implements Identified {

    /** Buys the owner's output. The one role every workspace has. */
    public static final String SELLER = "seller";

    /** Sells upgrades. Present from the base level that unlocks it. */
    public static final String UPGRADE = "upgrade";

    /**
     * Hires, fires and assigns workers.
     *
     * Arrives at the base level that grants the {@code workers} unlock. Its presence is the visible
     * signal that the worker system is available here — which is why it is a staffed role rather
     * than a menu button: a player should be able to see that their business can employ somebody.
     */
    public static final String MANAGER = "manager";

    public static Optional<WorkspaceNpcRole> parse(String key, ConfigurationSection body, Logger logger) {
        String id = Ids.normalise(key);

        if (!Ids.valid(id)) {
            logger.warning("workspace.yml → npc-roles → " + key + ": " + Ids.describeProblem(id) + ".");
            return Optional.empty();
        }

        String npcId = Ids.normalise(body.getString("npc", ""));

        if (npcId.isBlank()) {
            // Rejected at load rather than accepted and failed at spawn time. A role with no NPC is
            // spawned on every claim, every upgrade and every repair pass, and each attempt logs
            // that it cannot find the NPC "" — one clear line here beats that line forever.
            logger.warning("workspace.yml → npc-roles → " + key
                    + ": no \"npc\" is named, so nothing could ever be spawned for this role. Ignored.");
            return Optional.empty();
        }

        return Optional.of(new WorkspaceNpcRole(
                id,
                body.getString("display", id),
                npcId,
                body.getDouble("offset-x", 0.0d),
                body.getDouble("offset-y", 0.0d),
                body.getDouble("offset-z", 0.0d),
                // Suspendable by default: the roles that exist today are all services, and a new
                // role that should survive a tax lapse can say so explicitly.
                body.getBoolean("suspendable", true)));
    }

    /**
     * What happens when a workspace NPC in this role is right-clicked.
     *
     * The extension point that lets a future system own a role end to end. Registered against the
     * role id, so the workspace never learns what contracts or events are — it resolves the handler
     * and calls it.
     */
    @FunctionalInterface
    public interface Handler {
        /**
         * @param player    who clicked
         * @param workspace the workspace the NPC belongs to; the owner check has already passed
         */
        void handle(org.bukkit.entity.Player player, Workspace workspace);
    }
}
