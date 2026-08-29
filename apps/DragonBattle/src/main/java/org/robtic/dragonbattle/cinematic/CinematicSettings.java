package org.robtic.dragonbattle.cinematic;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.robtic.dragonbattle.battle.BattleState;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Logger;

/**
 * `cinematics.yml`, parsed once per reload.
 *
 * <h2>Names, never scene data</h2>
 *
 * This plugin does not describe a camera path and no longer animates anything itself. It holds the
 * <em>name</em> an operator gave a cinematic inside CS Cinematic, and hands that name to whichever
 * {@link CinematicProvider} is wired up. Authoring belongs in a tool with an in-game editor; naming
 * belongs here.
 *
 * Nothing in the code names a cinematic. Every one of them comes from the {@code cinematics} section
 * below, so a server that wants a different set edits YAML.
 */
public final class CinematicSettings {

    private final boolean enabled;
    private final String pluginName;
    private final String command;
    private final Audience audience;

    /**
     * Battle state → the cinematic to play.
     *
     * Keyed by state rather than by trigger id because a state is what actually fires — two trigger
     * names resolving to one state would otherwise both have to be looked up on every transition.
     * The trigger's own id is kept alongside it for the {@code %trigger%} placeholder and for logs.
     */
    private final Map<BattleState, Entry> cinematics = new EnumMap<>(BattleState.class);

    private final Map<BattleState, List<String>> extraCommands = new EnumMap<>(BattleState.class);

    /** One configured cinematic: the trigger an operator wrote, and the name they gave it. */
    public record Entry(String trigger, String cinematic) {
    }

    /** Who the cinematic is played for. */
    public enum Audience {
        /** Everyone in the world the arena's dragon spawns in. */
        ARENA_WORLD,
        /** Everyone on the server. */
        ALL,
        /** Nobody — the command runs once with an empty {@code %player%}, for its own selector. */
        NONE
    }

    public CinematicSettings(FileConfiguration config, Logger logger) {
        this.enabled = config.getBoolean("enabled", true);

        // Defaulted to CS Cinematic's own name and command, because that is what this integrates
        // with. Both stay configurable: neither can be verified from here, and an operator running a
        // fork should not need a rebuild to correct a name.
        this.pluginName = config.getString("plugin", "CSCinematic").trim();
        this.command = config.getString("command", "cs play %cinematic% %player%").trim();

        this.audience = parseAudience(config.getString("audience"), logger);

        readCinematics(config.getConfigurationSection("cinematics"), logger);

        // Anything the old `states` section named that the new one does not. See readLegacyStates.
        readLegacyStates(config.getConfigurationSection("states"), logger);

        readCommands(config.getConfigurationSection("commands"), logger);
    }

    /**
     * Reads the pre-1.0.2 {@code states} section, for a config file written before the rename.
     *
     * <h2>Why this is not just left to the config merge</h2>
     *
     * New keys are merged into an existing file from the packaged copy, so an upgraded install does
     * get a {@code cinematics} section. What it gets is the <em>packaged defaults</em> — scene names
     * invented by this plugin, which almost certainly do not exist in the operator's CS Cinematic —
     * while the names they actually configured sit in a {@code states} section nothing reads any
     * more.
     *
     * The symptom is the worst kind: cutscenes that used to play stop playing, with no error, on a
     * version whose release notes say cinematics were improved.
     *
     * So the old section is still read, and only fills moments the new one has left blank. An
     * operator who has migrated is unaffected; one who has not keeps working.
     */
    private void readLegacyStates(ConfigurationSection section, Logger logger) {
        if (section == null) {
            return;
        }

        int adopted = 0;

        for (String key : section.getKeys(false)) {
            String cinematic = section.getString(key, "");

            if (cinematic == null || cinematic.isBlank()) {
                continue;
            }

            Optional<CinematicTrigger> trigger = CinematicTrigger.parse(key);

            // Silently ignored rather than warned about: this is a section from an older format, and
            // a state that no longer exists is the format having moved on rather than an operator's
            // mistake.
            if (trigger.isEmpty() || cinematics.containsKey(trigger.get().state())) {
                continue;
            }

            cinematics.put(trigger.get().state(), new Entry(trigger.get().id(), cinematic.trim()));
            adopted++;
        }

        if (adopted > 0) {
            logger.warning("cinematics.yml still uses the old \"states\" section. " + adopted
                    + " cinematic(s) were read from it and still work, but it is no longer the"
                    + " supported format — move them under \"cinematics\" using the trigger names"
                    + " (" + CinematicTrigger.DRAGON_SPAWN + ", " + CinematicTrigger.DRAGON_DEATH
                    + ", " + CinematicTrigger.FIGHT_START + ", " + CinematicTrigger.FIGHT_FINISH
                    + ", " + CinematicTrigger.RITUAL_START + ") and delete \"states\".");
        }
    }

    // There was a check here that warned when the command began with `cscinematic`, on the basis
    // that CS Cinematic registers `/cs`. It was wrong: `/cscinematic play` is a real command on a
    // real install, and the warning fired on a configuration that worked perfectly.
    //
    // The lesson generalises. This plugin cannot know which commands another plugin registers, and
    // guessing produces false alarms that send operators to fix something that was never broken.
    // Whether a command works is answered by running it — see CommandCinematicProvider, which
    // reports only when the server itself does not recognise what was dispatched.

    /**
     * Reads the {@code cinematics} section: trigger name → cinematic name.
     *
     * A blank value is how an operator says "no cinematic here" without deleting the line, so it is
     * skipped rather than stored as an empty name that would be played as one.
     */
    private void readCinematics(ConfigurationSection section, Logger logger) {
        if (section == null) {
            return;
        }

        for (String key : section.getKeys(false)) {
            String cinematic = section.getString(key, "");

            if (cinematic == null || cinematic.isBlank()) {
                continue;
            }

            Optional<CinematicTrigger> trigger = CinematicTrigger.parse(key);

            if (trigger.isEmpty()) {
                logger.warning("Unknown cinematic trigger \"" + key + "\" in cinematics.yml — ignoring"
                        + " it. Valid triggers are: " + CinematicTrigger.describeValidKeys());
                continue;
            }

            Entry existing = cinematics.get(trigger.get().state());

            if (existing != null) {
                // Two triggers resolving to one state — `fight_start` and `active_fight`, say. Only
                // one can fire, and saying which one wins is better than the operator discovering it.
                logger.warning("cinematics.yml → \"" + key + "\" and \"" + existing.trigger()
                        + "\" are the same moment in the fight. Keeping \"" + existing.trigger()
                        + "\"; remove one of them.");
                continue;
            }

            cinematics.put(trigger.get().state(),
                    new Entry(trigger.get().id(), cinematic.trim()));
        }
    }

    private void readCommands(ConfigurationSection section, Logger logger) {
        if (section == null) {
            return;
        }

        for (String key : section.getKeys(false)) {
            List<String> commands = section.getStringList(key);

            if (commands.isEmpty()) {
                continue;
            }

            Optional<CinematicTrigger> trigger = CinematicTrigger.parse(key);

            if (trigger.isEmpty()) {
                logger.warning("Unknown trigger \"" + key + "\" in cinematics.yml → commands —"
                        + " ignoring it. Valid triggers are: " + CinematicTrigger.describeValidKeys());
                continue;
            }

            // Merged rather than replaced, so two trigger names for one state both contribute their
            // commands instead of one silently winning.
            List<String> merged = new ArrayList<>(
                    extraCommands.getOrDefault(trigger.get().state(), List.of()));

            merged.addAll(commands);
            extraCommands.put(trigger.get().state(), List.copyOf(merged));
        }
    }

    private Audience parseAudience(String raw, Logger logger) {
        if (raw == null || raw.isBlank()) {
            return Audience.ARENA_WORLD;
        }

        try {
            return Audience.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            logger.warning("Unknown audience \"" + raw + "\" in cinematics.yml — using ARENA_WORLD.");
            return Audience.ARENA_WORLD;
        }
    }

    /** Whether anything should be played at all. */
    public boolean enabled() {
        return enabled;
    }

    /** The cinematics plugin to look for before dispatching anything. */
    public String pluginName() {
        return pluginName;
    }

    public String command() {
        return command;
    }

    public Audience audience() {
        return audience;
    }

    /** The cinematic configured for this state, or empty when it has none. */
    public Optional<Entry> cinematic(BattleState state) {
        return Optional.ofNullable(cinematics.get(state));
    }

    /** Extra commands for this state, which run whether or not a cinematic is configured. */
    public List<String> commandsFor(BattleState state) {
        return extraCommands.getOrDefault(state, List.of());
    }

    /** How many cinematics are configured, for the enable log line. */
    public int count() {
        return cinematics.size();
    }
}
