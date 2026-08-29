package org.robtic.dragonbattle.cinematic;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.dragonbattle.battle.BattleState;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.StoredLocation;

import java.util.List;
import java.util.Optional;
import java.util.logging.Level;

/**
 * Plays whatever a moment in the fight has configured.
 *
 * <h2>This plugin triggers cinematics; it does not implement one</h2>
 *
 * Everything here resolves a configured name and hands it to a {@link CinematicProvider}. There is no
 * camera logic, no keyframes and — since the internal respawn animation was removed — no particle
 * choreography either. CS Cinematic owns all of that.
 *
 * <h2>Never load-bearing</h2>
 *
 * A provider that is not installed, a cinematic name that does not exist, a command that fails — none
 * of it touches the battle. Failures are logged once and the fight continues, because a cutscene that
 * did not play is a cosmetic problem and a battle that stopped is not.
 */
public final class CinematicService {

    private final Plugin plugin;

    private volatile CinematicSettings settings;
    private volatile CinematicProvider provider;

    public CinematicService(Plugin plugin, CinematicSettings settings) {
        this.plugin = plugin;
        this.settings = settings;
        this.provider = buildProvider(settings);
    }

    /** Swapped in on reload, so an edited cinematics.yml applies without a restart. */
    public void settings(CinematicSettings replacement) {
        this.settings = replacement;
        this.provider = buildProvider(replacement);
    }

    /**
     * Replaces the provider.
     *
     * The seam for a real CS Cinematic API binding, or for a different cinematics plugin entirely. A
     * caller that supplies one takes over from the command provider completely — see
     * {@link CinematicProvider} for why the shipped default drives a command.
     */
    public void provider(CinematicProvider replacement) {
        if (replacement != null) {
            this.provider = replacement;
        }
    }

    public CinematicProvider provider() {
        return provider;
    }

    private CinematicProvider buildProvider(CinematicSettings from) {
        return new CommandCinematicProvider(plugin, from.pluginName(), from.command());
    }

    /**
     * Plays the cinematic and any extra commands configured for this moment.
     *
     * Main thread only: dispatching a command from a worker is not safe, and every caller is already
     * on the tick.
     */
    public void play(Arena arena, BattleState state) {
        if (!settings.enabled()) {
            return;
        }

        try {
            playChecked(arena, state);
        } catch (RuntimeException failure) {
            // The outermost guard. Every layer below reports its own problems and returns; this is
            // here so that a fault nobody anticipated still cannot stop a fight.
            plugin.getLogger().log(Level.WARNING,
                    "A cinematic for " + state + " failed — the battle continues regardless.", failure);
        }
    }

    private void playChecked(Arena arena, BattleState state) {
        Optional<CinematicSettings.Entry> configured = settings.cinematic(state);
        List<String> extras = settings.commandsFor(state);

        if (configured.isEmpty() && extras.isEmpty()) {
            // Nothing is attached to this moment, which is the overwhelmingly common case. Returning
            // before resolving viewers keeps a fight's dozen transitions close to free.
            return;
        }

        List<Player> viewers = viewers(arena);
        String world = worldName(arena);

        configured.ifPresent(entry -> {
            CinematicProvider.Context context =
                    new CinematicProvider.Context(entry.trigger(), arena.name(), world);

            provider.play(entry.cinematic(), viewers, context);
        });

        String trigger = configured.map(CinematicSettings.Entry::trigger)
                .orElseGet(() -> state.name().toLowerCase(java.util.Locale.ROOT));

        String cinematic = configured.map(CinematicSettings.Entry::cinematic).orElse("");

        for (String extra : extras) {
            dispatchExtra(extra, arena, cinematic, trigger, world, viewers);
        }
    }

    /**
     * Runs one of the {@code commands} entries.
     *
     * These are not cinematics and deliberately do not go through the provider: they are a title, a
     * sound, a broadcast or a second plugin, and gating them on the cinematics plugin being installed
     * would make an unrelated feature depend on it.
     */
    private void dispatchExtra(
            String template,
            Arena arena,
            String cinematic,
            String trigger,
            String world,
            List<Player> viewers
    ) {
        if (template == null || template.isBlank()) {
            return;
        }

        String base = template
                .replace("%cinematic%", cinematic)
                .replace("%trigger%", trigger)
                .replace("%arena%", arena.name())
                .replace("%world%", world);

        if (!base.contains("%player%")) {
            run(base.replace("%player%", ""));
            return;
        }

        for (Player viewer : viewers) {
            run(base.replace("%player%", viewer.getName()));
        }
    }

    private void run(String command) {
        String trimmed = command.trim();

        if (trimmed.isEmpty()) {
            return;
        }

        try {
            plugin.getServer().dispatchCommand(plugin.getServer().getConsoleSender(), trimmed);
        } catch (RuntimeException error) {
            plugin.getLogger().log(Level.INFO,
                    "A cinematic command failed: \"" + trimmed + "\" — the battle continues.", error);
        }
    }

    private List<Player> viewers(Arena arena) {
        return switch (settings.audience()) {
            case ALL -> List.copyOf(plugin.getServer().getOnlinePlayers());
            case NONE -> List.of();
            case ARENA_WORLD -> arena.dragonSpawn()
                    .flatMap(StoredLocation::toBukkit)
                    .map(Location::getWorld)
                    .map(world -> List.copyOf(world.getPlayers()))
                    .orElseGet(List::of);
        };
    }

    private String worldName(Arena arena) {
        return arena.dragonSpawn().map(StoredLocation::world).orElse("");
    }

    /**
     * For the enable log line, so an operator can see the hooks were read and whether they will work.
     *
     * Whether the provider is actually installed is part of it, deliberately: "4 cinematic(s) via
     * CSCinematic (not installed)" at boot is the line that stops somebody spending an evening
     * wondering why their cutscenes never play.
     */
    public Optional<String> summary() {
        if (!settings.enabled() || settings.count() == 0) {
            return Optional.empty();
        }

        return Optional.of(settings.count() + " cinematic(s) via " + provider.name()
                + (provider.available() ? "" : " (not installed)"));
    }
}
