package org.robtic.dragonbattle.cinematic;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

/**
 * Plays cinematics through CS Cinematic's command.
 *
 * <h2>The command is CS Cinematic's documented interface</h2>
 *
 * {@code /cs play <name>} plays for the sender; {@code /cs play <name> <player>} forces a specific
 * player to watch. That is the whole published integration surface — see {@link CinematicProvider}
 * for why no API binding is attempted.
 *
 * <h2>Installed is checked, not assumed</h2>
 *
 * The plugin is looked up by name before anything is dispatched. Without that check a missing
 * cinematics plugin produced an unrecognised command, which {@code dispatchCommand} reports by
 * returning false rather than throwing — so the failure was indistinguishable from a wrong scene
 * name, and an operator had no way to tell which of the two they were looking at.
 *
 * The plugin name is configurable because it cannot be verified from here. CS Cinematic's data
 * folder is {@code plugins/CSCinematic}, which is the plugin's own name, and that is the default —
 * but an operator running a fork or a rename can correct it without waiting for a build.
 */
public final class CommandCinematicProvider implements CinematicProvider {

    private final Plugin plugin;
    private final String pluginName;
    private final String template;

    /**
     * Problems already reported, so a warning appears once rather than at every stage of every fight.
     *
     * A battle passes through a dozen states and a server runs battles all day; an unconditional
     * warning would fill the console faster than an operator could read it, and the one line that
     * mattered would scroll away.
     */
    private final Set<String> reported = ConcurrentHashMap.newKeySet();

    public CommandCinematicProvider(Plugin plugin, String pluginName, String template) {
        this.plugin = plugin;
        this.pluginName = pluginName;
        this.template = template == null ? "" : template.trim();
    }

    @Override
    public String name() {
        return pluginName;
    }

    /**
     * Whether a cinematic could be played.
     *
     * <h2>This deliberately no longer requires the named plugin</h2>
     *
     * It used to return false unless a plugin called exactly {@code pluginName} was enabled, and
     * {@link #play} refused to dispatch anything when it did. That turned a configurable hint into a
     * hard gate on a name this plugin cannot verify: a cinematics plugin whose name differs from the
     * default by a hyphen, a fork, or a rename meant every cutscene was silently skipped while the
     * command that would have played it worked fine from the console.
     *
     * A name is a guess. Whether the command runs is a fact, and the server answers it — see
     * {@link #run}. So the gate is gone: the presence of the plugin is now a diagnostic used to
     * write a better message when a dispatch fails, not a precondition for trying.
     */
    @Override
    public boolean available() {
        return !template.isBlank();
    }

    /** Whether the plugin named in the config is actually loaded. Used only to explain a failure. */
    private boolean namedPluginPresent() {
        org.bukkit.plugin.Plugin found = plugin.getServer().getPluginManager().getPlugin(pluginName);

        return found != null && found.isEnabled();
    }

    /**
     * Runs the configured command.
     *
     * A template containing {@code %player%} is run once per viewer, because CS Cinematic's
     * per-player form takes one name. One without it runs once however many people are watching —
     * running a command that already carries {@code @a} five times would play the scene five times.
     */
    @Override
    public boolean play(String cinematic, List<Player> viewers, Context context) {
        if (!available()) {
            warnOnce("blank", "cinematics.yml → command is empty, so nothing can be played."
                    + " Set it to the command your cinematics plugin uses.");
            return false;
        }

        String base = template
                .replace("%cinematic%", cinematic)
                .replace("%trigger%", context.trigger())
                .replace("%arena%", context.arena())
                .replace("%world%", context.world());

        if (!base.contains("%player%")) {
            return run(base.replace("%player%", ""));
        }

        if (viewers.isEmpty()) {
            // A per-player template with nobody to play it for is not a failure — an empty arena is
            // an ordinary state, and there is genuinely nothing to do.
            return true;
        }

        boolean any = false;

        for (Player viewer : viewers) {
            any |= run(base.replace("%player%", viewer.getName()));
        }

        return any;
    }

    /**
     * Dispatches one command and reports what happened.
     *
     * {@code dispatchCommand} does not throw for a command the server has never heard of — it returns
     * false. A config naming the wrong command therefore produced no exception, no log line and no
     * cutscene, which is why an unrecognised command is now named explicitly with the exact string
     * that was run.
     */
    private boolean run(String command) {
        String trimmed = command.trim();

        if (trimmed.isEmpty()) {
            return false;
        }

        try {
            boolean recognised =
                    plugin.getServer().dispatchCommand(plugin.getServer().getConsoleSender(), trimmed);

            if (recognised) {
                plugin.getLogger().fine("Cinematic command run: /" + trimmed);
                return true;
            }

            // The message says which of the two things is wrong, because they need different fixes:
            // a missing plugin is an install problem, and a present one means the command name in
            // the config is not the command it registers.
            warnOnce(firstWord(trimmed), namedPluginPresent()
                    ? "The server does not recognise \"/" + trimmed + "\", so no cinematic played."
                            + " \"" + pluginName + "\" is installed, so cinematics.yml → command does"
                            + " not match the command it registers. Check its own documentation for"
                            + " the right one."
                    : "The server does not recognise \"/" + trimmed + "\", so no cinematic played,"
                            + " and no plugin called \"" + pluginName + "\" is loaded. Install your"
                            + " cinematics plugin, or correct cinematics.yml → plugin and command."
                            + " The battle continues either way.");

            return false;
        } catch (RuntimeException error) {
            plugin.getLogger().log(Level.INFO,
                    "Cinematic command failed: \"" + trimmed + "\" — the battle continues regardless.",
                    error);
            return false;
        }
    }

    private void warnOnce(String key, String message) {
        if (reported.add(key)) {
            plugin.getLogger().warning(message);
        }
    }

    /** Clears the once-only warnings, so a reload that fixes a mistake reports honestly afterwards. */
    public void forgetWarnings() {
        reported.clear();
    }

    private static String firstWord(String command) {
        int space = command.indexOf(' ');
        return space < 0 ? command : command.substring(0, space);
    }
}
