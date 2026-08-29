package org.robtic.jobs.commands;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.config.MessageCatalog;
import org.robtic.jobs.jobs.Job;
import org.robtic.jobs.jobs.JobService;
import org.robtic.jobs.workspace.Workspace;
import org.robtic.jobs.workspace.WorkspaceController;
import org.robtic.jobs.workspace.WorkspaceService;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * {@code /workspace} — the panel, without walking to the building.
 *
 * <h2>Why this exists at all</h2>
 *
 * {@code plugin.yml} has declared this command since the module was split out, and nothing ever bound
 * an executor to it. Bukkit answers an unbound declared command with its usage line, so the command
 * appeared in tab completion, passed every permission check, and did nothing — which is worse than
 * not existing, because a player has no way to tell it from a bug in the panel itself.
 *
 * <h2>It opens the same panel the NPC does</h2>
 *
 * Routed through {@link WorkspaceController#open}, which is what the seller and upgrade NPCs use. So
 * ownership is re-checked, the maintenance bill is evaluated and a suspended workspace says so, all
 * exactly as it does when the panel is reached by clicking. Two entry points with two sets of checks
 * is how one of them ends up missing one.
 */
public final class WorkspaceCommand implements CommandExecutor, TabCompleter {

    private final JobService jobs;
    private final WorkspaceService workspaces;
    private final WorkspaceController controller;
    private final MessageCatalog messages;

    public WorkspaceCommand(
            JobService jobs,
            WorkspaceService workspaces,
            WorkspaceController controller,
            MessageCatalog messages
    ) {
        this.jobs = jobs;
        this.workspaces = workspaces;
        this.controller = controller;
        this.messages = messages;
    }

    @Override
    public boolean onCommand(
            @NotNull CommandSender sender,
            @NotNull Command command,
            @NotNull String label,
            @NotNull String[] args
    ) {
        // `/workspace marker …` belongs to RobticWorld and is forwarded there. See forwardToMarkers.
        if (args.length > 0 && args[0].equalsIgnoreCase(MARKER)) {
            return forwardToMarkers(sender, args);
        }

        if (!(sender instanceof Player player)) {
            sender.sendMessage(messages.prefixed("progression.player-only"));
            return true;
        }

        List<Workspace> owned = workspaces.ownedBy(player.getUniqueId());

        if (owned.isEmpty()) {
            player.sendMessage(messages.prefixed("progression.workspace.none-owned"));
            return true;
        }

        if (args.length > 0) {
            Optional<Workspace> named = workspaces.ownedBy(player.getUniqueId(),
                    args[0].toLowerCase(Locale.ROOT));

            if (named.isEmpty()) {
                player.sendMessage(messages.prefixed("progression.workspace.none-for-profession",
                        "job", args[0]));
                return true;
            }

            controller.open(player, named.get());
            return true;
        }

        // One workspace is the overwhelmingly common case — the free limit is exactly one — so it
        // opens rather than making the player pick from a list of one.
        if (owned.size() == 1) {
            controller.open(player, owned.getFirst());
            return true;
        }

        // Several. Listed with the profession each belongs to, because that is the argument this
        // command takes and a list that did not name it would leave the player guessing at it.
        player.sendMessage(messages.prefixed("progression.workspace.choose",
                "count", String.valueOf(owned.size())));

        for (Workspace workspace : owned) {
            player.sendMessage(messages.component("progression.workspace.choose-entry",
                    "job", displayOf(workspace.professionId()),
                    "id", workspace.professionId(),
                    "level", String.valueOf(workspace.level()),
                    "where", workspace.region().describe()));
        }

        return true;
    }

    /** The subcommand RobticWorld owns. */
    private static final String MARKER = "marker";

    /** RobticWorld's command, which {@code /workspace} shadows. See {@link #forwardToMarkers}. */
    private static final String STRUCTURE = "structure";

    /**
     * Hands {@code /workspace marker …} back to RobticWorld.
     *
     * <h2>Why this is needed at all</h2>
     *
     * RobticWorld declares {@code workspace} as an alias of {@code /structure} precisely so that
     * {@code /workspace marker edit} keeps working — it is the command in every builder's notes. But
     * Bukkit resolves a plugin's <em>primary</em> command ahead of another plugin's alias, and this
     * plugin declares {@code workspace} as primary. So the alias has been dead since the two plugins
     * were split: every ten-plugin install has RobticJobs in it, and the marker menu was reachable
     * only as {@code /structure marker edit}.
     *
     * Forwarding rather than reimplementing keeps the ownership honest. RobticWorld still holds the
     * permission check, the subcommands and the menu; this is a redirect and nothing more.
     *
     * The arguments are passed through unchanged, so {@code /workspace marker validate 96} behaves
     * exactly as {@code /structure marker validate 96} does.
     */
    private boolean forwardToMarkers(CommandSender sender, String[] args) {
        var structure = sender.getServer().getPluginCommand(STRUCTURE);

        if (structure == null) {
            // RobticWorld is a required dependency, so this means its command is not declared rather
            // than that the plugin is missing. Named plainly: the fix is in a plugin.yml.
            sender.sendMessage(messages.prefixed("progression.workspace.markers-unavailable"));
            return true;
        }

        // Bukkit's own dispatch, so the permission on the target command applies exactly as it would
        // if the player had typed /structure. Re-checking it here would be a second copy of a rule
        // RobticWorld owns, and the two would eventually disagree.
        return structure.execute(sender, STRUCTURE, args);
    }

    /** The profession's configured name, falling back to its id when it has been removed. */
    private String displayOf(String professionId) {
        return jobs.catalog().job(professionId).map(Job::display).orElse(professionId);
    }

    @Override
    public List<String> onTabComplete(
            @NotNull CommandSender sender,
            @NotNull Command command,
            @NotNull String label,
            @NotNull String[] args
    ) {
        // Past the first argument this is RobticWorld's command, so completion is too.
        if (args.length > 1 && args[0].equalsIgnoreCase(MARKER)) {
            var structure = sender.getServer().getPluginCommand(STRUCTURE);

            return structure == null || structure.getTabCompleter() == null
                    ? List.of()
                    : structure.getTabCompleter()
                            .onTabComplete(sender, structure, STRUCTURE, args);
        }

        if (args.length != 1 || !(sender instanceof Player player)) {
            return List.of();
        }

        String prefix = args[0].toLowerCase(Locale.ROOT);

        List<String> options = new java.util.ArrayList<>();

        // Only the professions this player actually has a workspace for. Completing every job would
        // offer arguments that are guaranteed to be refused.
        workspaces.ownedBy(player.getUniqueId()).stream()
                .map(Workspace::professionId)
                .forEach(options::add);

        if (sender.hasPermission(org.robtic.world.command.MarkerCommand.PERMISSION)) {
            options.add(MARKER);
        }

        return options.stream()
                .filter(option -> option.startsWith(prefix))
                .sorted()
                .toList();
    }
}
