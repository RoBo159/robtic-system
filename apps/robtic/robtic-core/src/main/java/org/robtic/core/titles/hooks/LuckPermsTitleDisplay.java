package org.robtic.core.titles.hooks;

import net.luckperms.api.LuckPerms;
import net.luckperms.api.LuckPermsProvider;
import net.luckperms.api.model.user.User;
import net.luckperms.api.node.NodeType;
import net.luckperms.api.node.types.PrefixNode;
import net.luckperms.api.node.types.SuffixNode;
import org.bukkit.plugin.Plugin;
import org.robtic.core.util.Colors;
import org.robtic.core.titles.Title;
import org.robtic.core.titles.TitleDisplay;

import java.util.Optional;
import java.util.UUID;
import java.util.logging.Level;

/**
 * Renders the equipped title as a LuckPerms prefix or suffix.
 *
 * <h2>The only class in the progression system that mentions LuckPerms</h2>
 *
 * Every LuckPerms type is confined here, so a server without the plugin never resolves them and
 * nothing else fails to load — the same isolation {@code LuckPermsGroupApplier} uses elsewhere in
 * this plugin. Everything upstream deals in {@link TitleDisplay}, which mentions nothing.
 *
 * <h2>Display only, and only this plugin's own nodes</h2>
 *
 * Ownership never touches LuckPerms; that lives in Robtic's storage. This writes one prefix node at
 * a reserved priority and removes exactly that one when the title changes — it does not clear a
 * player's prefixes, because a server almost certainly grants prefixes from rank groups and wiping
 * those would be a spectacular way to break a server's chat.
 *
 * <h2>Async, and never fatal</h2>
 *
 * LuckPerms writes go to its storage. Doing that on the tick would put a database write in front of
 * a menu click, so every mutation runs on a worker and any failure is logged rather than propagated
 * — the selection has already been saved by the title service and the player has already been told.
 */
public final class LuckPermsTitleDisplay implements TitleDisplay {

    /**
     * The priority this plugin's title nodes are written at.
     *
     * Deliberately high so a title wins over a rank prefix, and deliberately a specific number so
     * removal can find precisely the node this class added without disturbing anything else.
     */
    private static final int PRIORITY = 5000;

    private final Plugin plugin;
    private final LuckPerms luckPerms;
    private final boolean asSuffix;

    private LuckPermsTitleDisplay(Plugin plugin, boolean asSuffix) {
        this.plugin = plugin;
        this.luckPerms = LuckPermsProvider.get();
        this.asSuffix = asSuffix;
    }

    /**
     * Builds the hook, or returns {@link TitleDisplay#NONE} when LuckPerms is not usable.
     *
     * The construction is inside the try because {@code LuckPermsProvider.get()} is what throws when
     * the plugin is absent, and catching {@link Throwable} rather than {@link Exception} because a
     * missing class surfaces as {@link NoClassDefFoundError} — an Error, which an Exception catch
     * would let through and turn into a failed plugin start.
     */
    public static TitleDisplay createOrNone(Plugin plugin, boolean asSuffix) {
        if (plugin.getServer().getPluginManager().getPlugin("LuckPerms") == null) {
            plugin.getLogger().info("LuckPerms is not installed — titles will be owned and equipped "
                    + "as normal, but nothing will render them in chat.");
            return TitleDisplay.NONE;
        }

        try {
            return new LuckPermsTitleDisplay(plugin, asSuffix);
        } catch (Throwable unavailable) {
            plugin.getLogger().warning("LuckPerms is installed but its API is unavailable ("
                    + unavailable.getMessage() + "). Titles will not be rendered.");
            return TitleDisplay.NONE;
        }
    }

    @Override
    public void apply(UUID playerId, Optional<Title> title) {
        // The value is built here, on the calling thread, because it needs the Title — which the
        // worker below has no business holding a reference to across a config reload.
        Optional<String> value = title.map(LuckPermsTitleDisplay::render);

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> write(playerId, value));
    }

    /**
     * Renders a title as a legacy-coded string, which is what LuckPerms prefixes are.
     *
     * The trailing space is part of the prefix rather than something chat formatting is expected to
     * add, because a server's chat format is not this plugin's to assume.
     */
    private static String render(Title title) {
        String display = title.display();

        // A display that already carries its own colour codes is used verbatim; a plain one gets the
        // title's colour. Same precedence as Title#name, so chat and the GUI agree.
        if (display.indexOf('&') >= 0 || display.indexOf('§') >= 0) {
            return display + "&r ";
        }

        return Colors.toLegacy(title.color()) + display + "&r ";
    }

    private void write(UUID playerId, Optional<String> value) {
        try {
            User user = luckPerms.getUserManager().getUser(playerId);

            if (user == null) {
                user = luckPerms.getUserManager().loadUser(playerId).join();
            }

            if (user == null) {
                return;
            }

            boolean changed = clearOurNodes(user);

            if (value.isPresent()) {
                changed |= user.data().add(asSuffix
                        ? SuffixNode.builder(value.get(), PRIORITY).build()
                        : PrefixNode.builder(value.get(), PRIORITY).build()).wasSuccessful();
            }

            if (changed) {
                luckPerms.getUserManager().saveUser(user).join();
            }
        } catch (RuntimeException failure) {
            plugin.getLogger().log(Level.WARNING,
                    "Could not update the LuckPerms title display for " + playerId, failure);
        }
    }

    /**
     * Removes only the nodes this class wrote, identified by the reserved priority.
     *
     * Matching on priority rather than on the current title's text, because the text may have
     * changed in the config since it was applied — and a removal that matched on text would leave
     * the old prefix behind forever, with a new one stacked on top of it.
     */
    private boolean clearOurNodes(User user) {
        boolean changed = false;

        for (PrefixNode node : user.getNodes(NodeType.PREFIX)) {
            if (node.getPriority() == PRIORITY) {
                changed |= user.data().remove(node).wasSuccessful();
            }
        }

        for (SuffixNode node : user.getNodes(NodeType.SUFFIX)) {
            if (node.getPriority() == PRIORITY) {
                changed |= user.data().remove(node).wasSuccessful();
            }
        }

        return changed;
    }
}
