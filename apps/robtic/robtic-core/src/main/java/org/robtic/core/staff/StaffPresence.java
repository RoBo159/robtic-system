package org.robtic.core.staff;

import java.util.UUID;

/**
 * Whether a player is currently acting as staff.
 *
 * <h2>A cross-cutting question, so the contract is in Core</h2>
 *
 * "Is this player on duty" is asked by things that have nothing to do with moderation. The AFK timer
 * exempts staff in {@code /admin} because they are working rather than idle; visibility rules treat
 * a vanished moderator differently; a future contract system would not want to count staff time.
 *
 * None of those may depend on RobticStaff — an AFK timer that stops working because a moderation
 * plugin is absent would be absurd. So the question is an interface here, RobticStaff answers it,
 * and every asker degrades to "nobody is staff" when it is not installed.
 *
 * <h2>Why not just check a permission</h2>
 *
 * Because holding {@code robtic.staff} and <em>being in staff mode</em> are different states, and
 * the difference is the entire point. A moderator who is playing normally is not on duty; the same
 * account one command later is. A permission check cannot tell those apart, and would exempt every
 * staff member from the AFK timer permanently.
 */
@FunctionalInterface
public interface StaffPresence {

    /**
     * Whether this player is on duty right now.
     *
     * Answered from memory — this is called from the AFK tick and from visibility recalculation, both
     * of which run frequently and on the main thread.
     */
    boolean isActingAsStaff(UUID player);

    /** The answer when no staff plugin is installed: nobody is on duty. */
    StaffPresence NONE = player -> false;
}
