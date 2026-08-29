package org.robtic.core.service;

import net.luckperms.api.LuckPerms;
import net.luckperms.api.LuckPermsProvider;
import net.luckperms.api.event.user.UserDataRecalculateEvent;
import net.luckperms.api.model.group.Group;
import net.luckperms.api.model.user.User;
import net.luckperms.api.node.NodeType;
import net.luckperms.api.node.types.InheritanceNode;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.logging.Logger;

/**
 * Every reference to the LuckPerms API lives in this class and nowhere else.
 *
 * Keeping it isolated means the JVM only resolves those types once {@link PermissionSyncService}
 * has confirmed the plugin is installed — so nothing else in the plugin can fail to load on a
 * server without LuckPerms.
 *
 * <h2>Direction</h2>
 *
 * This class <em>reads</em> groups so they can be mirrored to Discord, and writes only the local
 * staff-mode swap. It deliberately has no method for applying a group delta handed down by Discord:
 * LuckPerms is the authority on who holds what, and a second writer is what made the old two-way
 * sync unpredictable.
 */
final class LuckPermsGroupApplier {

    private final LuckPerms luckPerms;
    private final Logger logger;

    LuckPermsGroupApplier(Logger logger) {
        this.luckPerms = LuckPermsProvider.get();
        this.logger = logger;
    }

    /**
     * The groups a player currently holds, lowercase. Blocks if the user is not already loaded.
     *
     * Read straight from LuckPerms rather than asked of the API over the network — this is what
     * lets staff rank be resolved with no HTTP request at all, which is where most of the old
     * per-player request volume went.
     *
     * Includes inherited groups, because a rank that a player holds only by inheritance is still a
     * rank they hold, and resolving it any other way would disagree with what the server enforces.
     */
    List<String> groupsOf(UUID uuid) {
        return namesOf(load(uuid));
    }

    /**
     * The groups of an already-loaded user, or empty when LuckPerms does not hold them in memory.
     *
     * Never touches storage, so it is safe on the server tick. Every online player is loaded, which
     * is the only case the tick-bound callers (placeholders, chat prefixes) ever ask about.
     */
    Optional<List<String>> loadedGroupsOf(UUID uuid) {
        User user = luckPerms.getUserManager().getUser(uuid);
        return user == null ? Optional.empty() : Optional.of(namesOf(user));
    }

    /**
     * Calls back whenever LuckPerms recalculates a user's data — which is what fires on any group
     * grant or revoke, however it was made.
     *
     * Subscribing is what makes the Discord mirror event-driven instead of polled. Without it the
     * only options are a timer that is either too slow to be useful or frequent enough to be the
     * request volume this change set out to remove.
     */
    void onGroupsChanged(Object plugin, Consumer<UUID> handler) {
        luckPerms.getEventBus().subscribe(plugin, UserDataRecalculateEvent.class,
                event -> handler.accept(event.getUser().getUniqueId()));
    }

    private static List<String> namesOf(User user) {
        if (user == null) {
            return List.of();
        }

        return user.getNodes(NodeType.INHERITANCE).stream()
                .map(InheritanceNode::getGroupName)
                .map(name -> name.toLowerCase(Locale.ROOT))
                .distinct()
                .toList();
    }

    /**
     * Swaps a player from whatever managed group they hold into exactly one target group.
     *
     * This is what staff mode needs: entering staff mode must leave the player holding their rank
     * group and *none* of the other managed groups, including the base one. Every group in
     * {@code managed} is removed and only {@code target} is added, so the outcome does not depend on
     * which group they happened to be in beforehand — while groups outside {@code managed} are
     * still left completely alone.
     *
     * This is a local write driven by an in-game action, not a sync from Discord.
     */
    void swapGroup(UUID uuid, String target, Collection<String> managed) {
        User user = load(uuid);
        if (user == null) {
            return;
        }

        boolean changed = false;

        for (String groupName : managed) {
            if (groupName.equalsIgnoreCase(target)) {
                continue;
            }

            Group group = luckPerms.getGroupManager().getGroup(groupName);
            if (group == null) {
                continue;
            }
            changed |= user.data().remove(InheritanceNode.builder(group).build()).wasSuccessful();
        }

        if (target != null && !target.isBlank()) {
            Group group = luckPerms.getGroupManager().getGroup(target);
            if (group == null) {
                logger.warning("Cannot apply unknown LuckPerms group \"" + target + "\"");
            } else {
                changed |= user.data().add(InheritanceNode.builder(group).build()).wasSuccessful();
            }
        }

        if (changed) {
            luckPerms.getUserManager().saveUser(user).join();
        }
    }

    private User load(UUID uuid) {
        User user = luckPerms.getUserManager().getUser(uuid);
        return user != null ? user : luckPerms.getUserManager().loadUser(uuid).join();
    }
}
