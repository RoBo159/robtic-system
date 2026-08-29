package org.robtic.jobs;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.robtic.core.RobticCorePlugin;
import org.robtic.core.placeholder.RobticPlaceholders;
import org.robtic.core.plugin.PluginDependency;
import org.robtic.core.plugin.RobticPlugin;
import org.robtic.core.service.RobticServices;
import org.robtic.core.statistics.StatisticsService;
import org.robtic.core.titles.TitleCatalog;
import org.robtic.core.titles.TitleService;
import org.robtic.core.unlock.Attributes;
import org.robtic.core.unlock.UnlockConditions;
import org.robtic.jobs.storage.ApiProgressionStorage;
import org.robtic.jobs.storage.FileProgressionStorage;
import org.robtic.jobs.storage.ProgressionStorage;

import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.OptionalInt;
import java.util.UUID;
import java.util.logging.Level;

/**
 * RobticJobs: professions and the workspaces they are practised in.
 *
 * The profession system, workspace claiming and upgrades, selling, NPCs, and the contracts,
 * reputation, collections and badges that will hang off them.
 *
 * <h2>It uses structures; it never generates them</h2>
 *
 * RobticWorld finds a building, reads its markers and announces it. This plugin listens and decides
 * that a particular building is a workspace. The dependency is one-way and enforced by the build:
 * RobticWorld does not know professions exist, so it cannot come to depend on them.
 *
 * <h2>Titles are Core's, and this plugin contributes to them</h2>
 *
 * A job's milestones grant titles, so this plugin needs the title catalogue — but titles are Core
 * infrastructure that works on a server with no professions at all. So Core owns the catalogue and
 * the service, and {@code JobCatalog} contributes milestone titles into the running instance rather
 * than building a second one.
 *
 * That leaves one cross-plugin hazard worth knowing about: reloading <em>Core's</em> titles clears
 * the catalogue, and the job milestone titles are only put back when this plugin reloads. Reload
 * both, or restart. See {@code ProgressionSystem#loadConfiguration}.
 *
 * <h2>Premium raises limits, and is not depended on</h2>
 *
 * How many professions a player may hold and how many workspaces they may claim are tier-dependent.
 * Both are read through Core's entitlement service, so this plugin works at free limits with no
 * RobticPremium installed.
 */
public final class RobticJobsPlugin extends RobticPlugin {

    private ProgressionSystem progression;

    @Override
    protected List<PluginDependency> dependencies() {
        return List.of(
                PluginDependency.required("RobticCore"),
                PluginDependency.required("RobticWorld"),
                PluginDependency.optional("Citizens",
                        "workspace NPCs will use the built-in backend"),
                PluginDependency.optional("RobticPremium",
                        "every player is limited to the free number of professions and workspaces"));
    }

    @Override
    protected void start() {
        RobticCorePlugin core = core();

        String backend = read("jobs.yml").getString("storage", "file");

        // Assigned rather than written as a ternary: the two branches are unrelated types and javac
        // will not infer a common one from them.
        ProgressionStorage storage;

        if ("api".equalsIgnoreCase(backend)) {
            storage = new ApiProgressionStorage(
                    require(org.robtic.core.api.ApiGateway.class).client(), core.config()::api);
        } else {
            storage = new FileProgressionStorage(
                    getDataFolder().toPath().resolve("progression"), getLogger());
        }

        progression = new ProgressionSystem(this,
                core.config().messages(),
                storage,
                require(TitleCatalog.class),
                require(TitleService.class),
                require(Attributes.class),
                require(UnlockConditions.class),
                () -> read("jobs.yml"),
                () -> read("npc.yml"),
                () -> read("workspace.yml"),
                () -> read("workers.yml"),
                this::premiumTier,
                this::isTester);

        RobticServices.find(StatisticsService.class).ifPresent(progression::statistics);

        progression.markers(markerSystem());

        startEconomy();
        startLicences();

        progression.enable();

        // After enable, because the job catalogue is only read there.
        auditLicences();

        contributePlaceholders();

        RobticServices.register(this, ProgressionSystem.class, progression);

        startDiscord();

        getLogger().info("RobticJobs ready.");
    }

    @Override
    protected void stop() {
        if (progression != null) {
            progression.disable();
        }
    }

    /**
     * Adds this plugin's placeholders to Core's single expansion.
     *
     * PlaceholderAPI allows one expansion per identifier and all Robtic placeholders answer to
     * {@code robtic}, so nothing here registers an expansion of its own — see
     * {@link RobticPlaceholders}.
     */
    private void contributePlaceholders() {
        RobticServices.find(RobticPlaceholders.class).ifPresentOrElse(
                expansion -> expansion.extend(progression.placeholders()),
                () -> getLogger().warning("RobticCore did not register the placeholder expansion, so"
                        + " job and title placeholders will not resolve."));
    }

    // ─── Economy and licences ─────────────────────────────────────────────────────────────────

    /**
     * Hands the progression system an economy.
     *
     * <h2>Nothing worked without this, and nothing said so</h2>
     *
     * {@code ProgressionSystem#economy} existed, was documented as mandatory, and was never called.
     * The default {@link org.robtic.jobs.market.JobEconomy#NONE} refuses every payment, so on a live
     * server: selling answered "the economy is unavailable", every workspace upgrade came back as
     * "you cannot afford this" regardless of balance, and — worst of the three — maintenance could
     * never be paid, which suspends a workspace permanently with no way for the owner to restore it.
     * None of that produces an error in the console, because a refused payment is a legitimate
     * outcome that the callers are written to handle gracefully.
     *
     * The economy is Core's {@code RobsService}. If it is somehow absent the system stays on NONE,
     * but it says so at WARNING rather than leaving an operator to discover it through the tax
     * system months later.
     */
    private void startEconomy() {
        RobticServices.find(org.robtic.core.service.RobsService.class).ifPresentOrElse(
                robs -> progression.economy(
                        new org.robtic.jobs.market.RobsJobEconomy(robs, getLogger())),
                () -> getLogger().warning("RobticCore did not register the robs service, so selling,"
                        + " workspace upgrades and workspace maintenance are all unavailable."));
    }

    /**
     * Hands the progression system its licence gate.
     *
     * Optional throughout: RobticCore self-disables the licence system rather than failing to start
     * if it cannot load, and a job that names no {@code license:} is never gated regardless. So a
     * missing licence system is one line and a fully playable profession loop, not a refusal.
     *
     * A job that <em>does</em> name a licence while the system is absent is a different matter, and
     * is named individually by {@link #auditLicences} — that configuration is asking for a gate the
     * server cannot enforce, and enforcing nothing silently is not a reasonable reading of it.
     */
    private void startLicences() {
        var system = RobticServices.find(org.robtic.core.license.LicenseSystem.class);

        if (system.isEmpty()) {
            getLogger().info("The licence system is not available, so professions that require a"
                    + " licence cannot be gated on one.");
            return;
        }

        licences = system.get().service();

        progression.licenses(new org.robtic.jobs.hooks.CoreLicenseGate(licences));
    }

    /** Core's licence service, or null when the licence system is not running. */
    private org.robtic.core.license.LicenseService licences;

    /**
     * Reports jobs whose {@code license:} cannot be enforced or does not exist.
     *
     * Runs after enable, because the job catalogue is only read there. Both cases are warnings rather
     * than failures: an unresolvable licence id refuses claims at the gate — see {@code
     * CoreLicenseGate} — so the job is safe, it is just unclaimable, and the operator needs to be
     * told which one and why rather than fielding a bug report about a recruiter that does nothing.
     */
    private void auditLicences() {
        for (var job : progression.jobs().catalog().all()) {
            var required = job.license();

            if (required.isEmpty()) {
                continue;
            }

            if (licences == null) {
                getLogger().warning("The profession \"" + job.id() + "\" requires the licence \""
                        + required.get() + "\", but the licence system is not running. It cannot be"
                        + " claimed until it is.");
                continue;
            }

            if (!licences.exists(required.get())) {
                getLogger().warning("The profession \"" + job.id() + "\" requires the licence \""
                        + required.get() + "\", which licenses.yml does not define. It cannot be"
                        + " claimed until the id is corrected.");
            }
        }
    }

    // ─── Entitlements ─────────────────────────────────────────────────────────────────────────

    /**
     * The player's premium tier, or zero.
     *
     * Resolved per call through Core rather than captured, because RobticPremium registers its
     * implementation after this plugin may have built the function — and because Core always has a
     * do-nothing implementation registered, this never has to check for null.
     */
    private int premiumTier(UUID player) {
        return RobticServices.findOr(org.robtic.core.entitlement.EntitlementService.class,
                org.robtic.core.entitlement.EntitlementService.NONE).tier(player);
    }

    /**
     * Whether this account is a tester.
     *
     * A permission rather than a tier: testers are staff exercising a feature they have not bought,
     * and nothing about that should reach the API or look like a purchase.
     */
    private boolean isTester(UUID player) {
        var online = getServer().getPlayer(player);

        return online != null && online.hasPermission("robtic.tester");
    }

    // ─── Plumbing ─────────────────────────────────────────────────────────────────────────────

    private <T> T require(Class<T> contract) {
        return RobticServices.find(contract).orElseThrow(() -> new IllegalStateException(
                "RobticCore did not register " + contract.getSimpleName()
                        + ". RobticJobs cannot start without it."));
    }

    /**
     * RobticWorld's marker system, or null when it is not usable.
     *
     * Reached through the plugin instance rather than through {@code RobticServices} because that is
     * where RobticWorld exposes it. RobticWorld is a required dependency — {@link #dependencies()}
     * refuses to start without it — so the null case here is narrow: the plugin is present but its
     * marker system failed to build. Handled anyway, because "required" guarantees the plugin loaded
     * and not that every part of it did.
     */
    private org.robtic.world.StructureMarkerSystem markerSystem() {
        var found = getServer().getPluginManager().getPlugin("RobticWorld");

        if (found instanceof org.robtic.world.RobticWorldPlugin world) {
            return world.markers();
        }

        getLogger().warning("RobticWorld is not the plugin this was compiled against, so structure"
                + " markers cannot be read.");

        return null;
    }

    private RobticCorePlugin core() {
        var found = getServer().getPluginManager().getPlugin("RobticCore");

        if (found instanceof RobticCorePlugin plugin) {
            return plugin;
        }

        throw new IllegalStateException("RobticCore is not the plugin this was compiled against.");
    }

    /** Never null: resolves to a do-nothing integration when Discord is off or absent. */
    private org.robtic.core.discord.DiscordIntegration discord;

    /**
     * This plugin's optional Discord integration.
     *
     * Off by default. Everything this plugin does works identically without RobticDiscord installed
     * — Discord only ever adds a copy of something that already happened.
     */
    private void startDiscord() {
        org.robtic.core.discord.DiscordSettings settings =
                org.robtic.core.discord.DiscordSettings.parse(
                        read("jobs.yml").getConfigurationSection("discord"), "jobs.yml", getLogger());

        discord = org.robtic.core.discord.DiscordIntegration.resolve(this, settings);

        org.robtic.core.service.RobticServices.register(this,
                org.robtic.core.discord.DiscordDocument.class,
                new org.robtic.core.discord.DiscordDocument() {

                    @Override
                    public String name() {
                        return "jobs";
                    }

                    @Override
                    public java.util.Map<String, String> logChannels() {
                        return org.robtic.core.discord.DiscordSettings.parse(
                                read("jobs.yml").getConfigurationSection("discord"),
                                "jobs.yml", getLogger()).channels().isEmpty()
                                ? java.util.Map.of()
                                : routes();
                    }
                });
    }

    /** The configured routes, read fresh so a reload takes effect without a restart. */
    private java.util.Map<String, String> routes() {
        var section = read("jobs.yml").getConfigurationSection("discord.log-actions");

        if (section == null) {
            return java.util.Map.of();
        }

        java.util.Map<String, String> routes = new java.util.LinkedHashMap<>();

        for (String action : section.getKeys(false)) {
            String channel = section.getString(action, "");

            if (channel != null && !channel.isBlank()) {
                routes.put(action, channel.trim());
            }
        }

        return routes;
    }

    private FileConfiguration read(String name) {
        File file = new File(getDataFolder(), name);

        if (!file.exists()) {
            saveResource(name, false);
        }

        FileConfiguration configuration = YamlConfiguration.loadConfiguration(file);

        try (var stream = getResource(name)) {
            if (stream != null) {
                configuration.setDefaults(YamlConfiguration.loadConfiguration(
                        new InputStreamReader(stream, StandardCharsets.UTF_8)));
                configuration.options().copyDefaults(true);
            }
        } catch (Exception error) {
            getLogger().log(Level.WARNING, "Could not merge defaults for " + name, error);
        }

        return configuration;
    }

    public ProgressionSystem progression() {
        return progression;
    }

    /** Unused placeholder for a future limit lookup, kept for symmetry with the entitlement API. */
    @SuppressWarnings("unused")
    private OptionalInt limit(UUID player, String key) {
        return RobticServices.findOr(org.robtic.core.entitlement.EntitlementService.class,
                org.robtic.core.entitlement.EntitlementService.NONE).limit(player, key);
    }
}
