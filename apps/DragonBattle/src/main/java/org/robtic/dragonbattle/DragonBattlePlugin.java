package org.robtic.dragonbattle;

import org.bukkit.Material;
import org.bukkit.command.PluginCommand;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.java.JavaPlugin;
import org.robtic.dragonbattle.build.BeaconBuilder;
import org.robtic.dragonbattle.build.GatewayBuilder;
import org.robtic.dragonbattle.build.PortalBuilder;
import org.robtic.dragonbattle.cinematic.CinematicService;
import org.robtic.dragonbattle.cinematic.CinematicSettings;
import org.robtic.dragonbattle.commands.DragonBattleCommand;
import org.robtic.dragonbattle.config.MessageCatalog;
import org.robtic.dragonbattle.config.PluginSettings;
import org.robtic.dragonbattle.listeners.BattleStageListener;
import org.robtic.dragonbattle.listeners.CrystalListener;
import org.robtic.dragonbattle.listeners.DragonListener;
import org.robtic.dragonbattle.listeners.PlayerSpawnListener;
import org.robtic.dragonbattle.manager.ArenaManager;
import org.robtic.dragonbattle.manager.BattleManager;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.ritual.RitualSequence;
import org.robtic.dragonbattle.ritual.RitualController;
import org.robtic.dragonbattle.scheduler.BattleTicker;
import org.robtic.dragonbattle.storage.ArenaStorage;

import java.io.File;
import java.util.EnumSet;
import java.util.logging.Level;
import java.util.Set;

/**
 * Entry point and composition root.
 *
 * <h2>Everything is constructed here and injected</h2>
 *
 * No class reaches for a global and nothing is static, which is what lets any of these be exercised
 * against fixtures rather than a live server — and what makes a reload a matter of replacing objects
 * rather than mutating state something else may be halfway through reading.
 *
 * <h2>Nothing outside this plugin is touched</h2>
 *
 * There is no database, no HTTP client and no dependency on another plugin. The only state that
 * outlives a restart is the YAML in this plugin's own folder, and the only Minecraft internals used
 * are public Bukkit API. In particular the vanilla {@code DragonBattle} is never obtained or
 * modified: the dragon entity is driven through its public phase and podium, and the fight's
 * sequencing is this plugin's own state machine.
 */
public final class DragonBattlePlugin extends JavaPlugin {

    private PluginSettings settings;
    private MessageCatalog messages;

    private ArenaManager arenas;
    private BattleManager battles;
    private BattleTicker ticker;
    private CinematicService cinematics;

    private DragonBattleCommand command;

    @Override
    public void onEnable() {
        // Written on first run so an operator has a documented file to edit rather than an empty
        // folder and a wiki to find.
        saveDefaultConfig();
        saveResourceIfAbsent("battle.yml");
        saveResourceIfAbsent("messages.yml");
        saveResourceIfAbsent("cinematics.yml");

        loadConfiguration();


        RitualController ritual = new RitualController();

        arenas = new ArenaManager(new ArenaStorage(this), settings);
        arenas.load();

        battles = new BattleManager(this, settings, messages);
        ticker = new BattleTicker(this, battles, settings);

        command = new DragonBattleCommand(
                arenas, battles, messages, this::reloadEverything, this::regenerateConfigs);
        bind("dragonbattle", command);

        // The builders read the portal whitelist once. It is a plugin-wide list rather than a
        // per-arena one because it describes what is safe to overwrite in general, and an operator
        // wanting different rules per arena has the replace mode for that.
        Set<Material> whitelist = readPortalWhitelist();

        getServer().getPluginManager().registerEvents(
                new CrystalListener(this, arenas, battles, ritual, messages), this);
        getServer().getPluginManager().registerEvents(
                new DragonListener(this, battles), this);
        getServer().getPluginManager().registerEvents(
                new PlayerSpawnListener(arenas), this);

        // Everything that touches the world hangs off the state machine's event rather than living
        // inside it — see BattleStageListener.
        cinematics = new CinematicService(this, readCinematics());

        getServer().getPluginManager().registerEvents(new BattleStageListener(
                this,
                new PortalBuilder(whitelist),
                new BeaconBuilder(this, whitelist),
                new GatewayBuilder(),
                new RitualSequence(this, ritual, () -> settings.keepRitualCrystals()),
                settings,
                cinematics,
                messages), this);

        ticker.start();

        getLogger().info("DragonBattle enabled with " + arenas.all().size() + " arena(s)"
                + cinematics.summary().map(summary -> " and " + summary).orElse("") + ".");
    }

    @Override
    public void onDisable() {
        if (ticker != null) {
            ticker.stop();
        }

        // Every running battle is ended and its dragon removed.
        //
        // A battle is a property of a running server: leaving a dragon behind would mean a restart
        // came back to a boss flying over an arena with nothing tracking it, immune to /dragonbattle
        // stop because no battle claims it.
        if (battles != null && arenas != null) {
            for (Arena arena : arenas.all()) {
                battles.stop(arena, true);
            }
        }

        if (arenas != null) {
            arenas.save();
        }
    }

    /** Re-reads every file and rebuilds the settings. Arenas are reloaded from disk with them. */
    private void reloadEverything() {
        reloadConfig();
        loadConfiguration();

        arenas.load();

        // Swapped rather than rebuilt: the listener holds the service, so replacing its settings is
        // what makes an edited cinematics.yml apply without re-registering anything.
        cinematics.settings(readCinematics());

        // The same reason: the battle manager is held by the ticker and the listeners, so edited
        // healing values are pushed into it rather than a new manager being constructed.
        battles.healing(settings.crystalHealing());
        battles.flight(settings.arenaFlight());

        ticker.start();
    }

    private CinematicSettings readCinematics() {
        return new CinematicSettings(read("cinematics.yml"), getLogger());
    }

    private void loadConfiguration() {
        settings = new PluginSettings(getConfig(), read("battle.yml"));
        messages = new MessageCatalog(read("messages.yml"));
    }

    /**
     * Reads a config file, merging in any keys the packaged copy has and the file on disk does not.
     *
     * <h2>Why the merge is not optional</h2>
     *
     * `saveResourceIfAbsent` writes the packaged file once, on first run, and never touches it
     * again — which is right, because an operator's edits must survive. But it means every key
     * added by a later version is missing from every existing install, forever. The symptom is not
     * a crash or a warning: it is `<missing message: egg.unset>` appearing in game for commands that
     * worked perfectly in testing, where the data folder was new.
     *
     * Merging the packaged copy in as *defaults* fixes that permanently. A key the operator has
     * edited keeps their value, because defaults only apply where the file is silent; a key they
     * have never seen appears with the packaged text. Every future addition to any of these files is
     * picked up on the next start with no action from anyone.
     */
    private FileConfiguration read(String name) {
        FileConfiguration configuration =
                YamlConfiguration.loadConfiguration(new File(getDataFolder(), name));

        try (var stream = getResource(name)) {
            if (stream != null) {
                configuration.setDefaults(YamlConfiguration.loadConfiguration(
                        new java.io.InputStreamReader(stream, java.nio.charset.StandardCharsets.UTF_8)));
                configuration.options().copyDefaults(true);
            }
        } catch (Exception failure) {
            // Not fatal: the operator's own file still loads, and only the keys added since their
            // install are missing. Saying so is more useful than refusing to start.
            getLogger().warning("Could not merge the packaged defaults for " + name
                    + " (" + failure.getMessage() + "). Keys added by a plugin update may be missing.");
        }

        return configuration;
    }

    /**
     * Copies a packaged file on first run.
     *
     * `saveResource` throws when the file already exists, so the check is not optional — and a
     * plugin that failed to enable on its second start would be a plugin that worked exactly once.
     */
    private void saveResourceIfAbsent(String name) {
        if (!new File(getDataFolder(), name).exists()) {
            saveResource(name, false);
        }
    }

    /**
     * Replaces the packaged config files with the current version's, keeping a backup.
     *
     * <h2>Why this exists</h2>
     *
     * Merging new keys into an existing file preserves an operator's edits, which is right almost
     * always — and useless when a file's *shape* changes. Renaming a section leaves the old one in
     * place, unread, next to a new one full of defaults; a comment block explaining a feature is
     * never seen by anyone who installed before it was written. The only way out is to take the new
     * file.
     *
     * <h2>What is never touched</h2>
     *
     * {@code arenas.yml}. It is not configuration — it is the arenas themselves, built up in game
     * over hours with pos1, pos2, perches, crystals and gateways, and there is no packaged copy of
     * it to restore. Regenerating it would destroy work that cannot be typed back in, so it is
     * excluded here rather than merely absent from the list.
     *
     * The old file is kept as {@code <name>.old} rather than deleted, so anything the operator had
     * customised can be copied across afterwards.
     *
     * @return how many files were replaced
     */
    public int regenerateConfigs() {
        int replaced = 0;

        for (String name : REGENERATED_FILES) {
            File current = new File(getDataFolder(), name);

            try {
                if (current.exists()) {
                    File backup = new File(getDataFolder(), name + ".old");

                    java.nio.file.Files.move(current.toPath(), backup.toPath(),
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                }

                saveResource(name, true);
                replaced++;
            } catch (java.io.IOException | RuntimeException failure) {
                getLogger().log(Level.WARNING,
                        "Could not regenerate " + name + " — it has been left as it was.", failure);
            }
        }

        if (replaced > 0) {
            reloadConfig();
            reloadEverything();
        }

        return replaced;
    }

    /**
     * The files {@link #regenerateConfigs()} replaces.
     *
     * Deliberately does not contain {@code arenas.yml}, and must not: see above.
     */
    private static final String[] REGENERATED_FILES =
            {"config.yml", "battle.yml", "messages.yml", "cinematics.yml"};

    /**
     * The materials the portal may overwrite in WHITELIST mode.
     *
     * An unrecognised name is logged and skipped rather than failing the load: a typo in a list of
     * twenty materials should cost the operator that one entry, not the plugin.
     */
    private Set<Material> readPortalWhitelist() {
        FileConfiguration battle = YamlConfiguration.loadConfiguration(new File(getDataFolder(), "battle.yml"));
        Set<Material> materials = EnumSet.noneOf(Material.class);

        for (String name : battle.getStringList("portal-whitelist")) {
            Material material = Material.matchMaterial(name);

            if (material == null) {
                getLogger().warning("Unknown material \"" + name + "\" in battle.yml portal-whitelist — ignoring it.");
                continue;
            }

            materials.add(material);
        }

        return materials;
    }

    private void bind(String name, DragonBattleCommand executor) {
        PluginCommand registered = getCommand(name);

        if (registered == null) {
            getLogger().warning("Command \"" + name + "\" is missing from plugin.yml");
            return;
        }

        registered.setExecutor(executor);
        registered.setTabCompleter(executor);
    }
}
