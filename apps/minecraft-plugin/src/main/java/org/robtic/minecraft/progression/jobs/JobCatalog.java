package org.robtic.minecraft.progression.jobs;

import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.MemoryConfiguration;
import org.robtic.minecraft.util.Ids;
import org.robtic.minecraft.progression.api.Registry;
import org.robtic.minecraft.progression.market.SellPrice;
import org.robtic.minecraft.progression.titles.Title;
import org.robtic.minecraft.progression.titles.TitleCatalog;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.logging.Logger;

/**
 * Reads {@code jobs.yml} into the job registry, and contributes each job's milestone titles to the
 * title catalog.
 *
 * <h2>Milestone titles are defined with the job, and registered as ordinary titles</h2>
 *
 * A server adding a Beekeeper writes the job and its five titles in one section of one file, rather
 * than the job in {@code jobs.yml} and five titles in {@code titles.yml} that have to be kept in
 * step by hand. Getting that wrong — a milestone naming a title that was never defined — is the
 * single most likely configuration mistake in the whole system, and defining them together makes it
 * unrepresentable.
 *
 * They are then handed to {@link TitleCatalog#contribute} and become indistinguishable from
 * hand-written titles: the same GUI lists them, the same filters apply, the same service equips
 * them. "Job title" is not a special case anywhere downstream, which is what keeps the title system
 * ignorant of jobs.
 *
 * <h2>Load order</h2>
 *
 * Titles must be loaded before jobs, because contributing a job title into a catalog that has not
 * yet read its rarities would resolve every one of them to UNKNOWN.
 */
public final class JobCatalog {

    private final Logger logger;
    private final TitleCatalog titles;
    private final Registry<Job> jobs;

    public JobCatalog(Logger logger, TitleCatalog titles) {
        this.logger = logger;
        this.titles = titles;
        this.jobs = new Registry<>("job", logger);
    }

    public Registry<Job> jobs() {
        return jobs;
    }

    public Optional<Job> job(String id) {
        return jobs.find(id);
    }

    public List<Job> all() {
        return List.copyOf(jobs.all());
    }

    /**
     * Rebuilds the job registry and re-contributes every milestone title.
     *
     * Must run after {@link TitleCatalog#load}, which clears the title registry — contributing
     * before that would have the job titles wiped out by the very reload that produced them.
     */
    public void load(ConfigurationSection root) {
        jobs.clear();

        if (root == null) {
            logger.warning("jobs.yml is empty or unreadable — no jobs were loaded.");
            return;
        }

        ConfigurationSection section = root.getConfigurationSection("jobs");

        if (section == null) {
            logger.warning("jobs.yml has no \"jobs\" section.");
            return;
        }

        for (String key : section.getKeys(false)) {
            ConfigurationSection body = section.getConfigurationSection(key);

            if (body == null) {
                logger.warning("jobs.yml → " + key + " is not a section and was ignored.");
                continue;
            }

            parse(key, body).ifPresent(jobs::register);
        }

        logger.info("Loaded " + jobs.size() + " job(s).");
    }

    private Optional<Job> parse(String key, ConfigurationSection body) {
        String id = Ids.normalise(key);
        String where = "jobs.yml → " + id;

        if (!Ids.valid(id)) {
            logger.warning(where + ": " + Ids.describeProblem(id) + ".");
            return Optional.empty();
        }

        int maxLevel = body.getInt("max-level", 100);
        XpCurve curve = XpCurve.parse(body.getConfigurationSection("xp-curve"), maxLevel, where, logger);

        Material icon = Optional.ofNullable(Material.matchMaterial(body.getString("icon", "IRON_PICKAXE")))
                .orElseGet(() -> {
                    logger.warning(where + ": unknown icon material \"" + body.getString("icon")
                            + "\", using IRON_PICKAXE.");
                    return Material.IRON_PICKAXE;
                });

        String permission = body.getString("permission", "");

        return Optional.of(new Job(
                id,
                body.getString("display", id),
                icon,
                description(body),
                curve.maxLevel(),
                curve,
                milestones(id, body.getConfigurationSection("titles"), where),
                rewards(body.getConfigurationSection("rewards"), where),
                prices(body.getConfigurationSection("prices"), where),
                permission.isBlank() ? Optional.empty() : Optional.of(permission),
                Ids.normalise(body.getString("recruiter", id + "_recruiter")),
                workspace(body, where, logger),
                settings(body.getConfigurationSection("settings"))
        ));
    }

    private static List<String> description(ConfigurationSection body) {
        if (body.isList("description")) {
            return List.copyOf(body.getStringList("description"));
        }

        String single = body.getString("description", "");
        return single.isBlank() ? List.of() : List.of(single);
    }

    /**
     * Parses the {@code titles} section: level → title definition.
     *
     * Each definition is registered as a real title and the level-to-id mapping is returned. A
     * milestone above the job's cap is dropped with a warning, because it can never be reached and
     * an unreachable title in the GUI is a promise the server cannot keep.
     */
    private TreeMap<Integer, String> milestones(String jobId, ConfigurationSection section, String where) {
        TreeMap<Integer, String> milestones = new TreeMap<>();

        if (section == null) {
            return milestones;
        }

        int maxLevel = jobMaxLevelHint(section);

        for (String levelKey : section.getKeys(false)) {
            int level;

            try {
                level = Integer.parseInt(levelKey.trim());
            } catch (NumberFormatException notANumber) {
                logger.warning(where + " → titles: \"" + levelKey
                        + "\" is not a level number and was ignored.");
                continue;
            }

            if (level < 1) {
                logger.warning(where + " → titles: level " + level + " is below 1 and was ignored.");
                continue;
            }

            ConfigurationSection body = section.getConfigurationSection(levelKey);

            if (body == null) {
                logger.warning(where + " → titles → " + levelKey + " is not a section.");
                continue;
            }

            String titleId = Ids.normalise(body.getString("id", jobId + "_" + level));

            // Source and the owning job are stamped on rather than left to the operator. Every title
            // defined here is by definition a job title, and requiring it to be declared would only
            // create the chance of it being declared wrongly.
            ConfigurationSection stamped = copyWithDefaults(body, jobId);

            Optional<Title> title = titles.parse(titleId, stamped,
                    where + " → titles → " + levelKey);

            if (title.isEmpty()) {
                continue;
            }

            if (!titles.contribute(title.get())) {
                // Already reported by the registry as a duplicate id. The milestone is still mapped,
                // so the job grants whichever title won the collision rather than nothing at all.
                logger.warning(where + " → titles → " + levelKey + ": the title id \"" + titleId
                        + "\" is already in use. The job will grant the existing title.");
            }

            if (maxLevel > 0 && level > maxLevel) {
                logger.warning(where + " → titles: level " + level + " is above this job's max-level ("
                        + maxLevel + ") and can never be reached.");
            }

            milestones.put(level, titleId);
        }

        return milestones;
    }

    /**
     * Reads the job's max level from the parent section, for the unreachable-milestone warning.
     *
     * Awkward but worth it: the warning is far more useful than the same milestone silently never
     * firing, and threading the value through every method purely to produce one message would be
     * worse than reaching up for it here.
     */
    private static int jobMaxLevelHint(ConfigurationSection titlesSection) {
        ConfigurationSection parent = titlesSection.getParent();
        return parent == null ? 0 : parent.getInt("max-level", 0);
    }

    /**
     * Copies a title body, adding the source and the owning job.
     *
     * A copy rather than mutating the live config, because the config object is re-read on reload and
     * writing into it would make the second reload see values the file does not contain.
     */
    private static ConfigurationSection copyWithDefaults(ConfigurationSection body, String jobId) {
        MemoryConfiguration copy = new MemoryConfiguration();

        for (String key : body.getKeys(true)) {
            if (!body.isConfigurationSection(key)) {
                copy.set(key, body.get(key));
            }
        }

        if (!copy.isSet("source")) {
            copy.set("source", "job");
        }

        copy.set("metadata.job", jobId);

        return copy;
    }

    /** Action key → XP. Keys are normalised so casing in the file never silently kills a reward. */
    private Map<String, Double> rewards(ConfigurationSection section, String where) {
        Map<String, Double> rewards = new LinkedHashMap<>();

        if (section == null) {
            return rewards;
        }

        for (String key : section.getKeys(false)) {
            double xp = section.getDouble(key, 0.0d);

            if (xp <= 0.0d) {
                logger.warning(where + " → rewards: \"" + key + "\" gives " + xp
                        + " XP and was ignored. Rewards must be positive.");
                continue;
            }

            rewards.put(JobAction.normaliseKey(key), xp);
        }

        return rewards;
    }

    private Map<String, SellPrice> prices(ConfigurationSection section, String where) {
        Map<String, SellPrice> prices = new LinkedHashMap<>();

        if (section == null) {
            return prices;
        }

        for (String key : section.getKeys(false)) {
            SellPrice.parse(section, key, where + " → prices", logger)
                    .ifPresent(price -> prices.put(price.itemKey(), price));
        }

        return prices;
    }

    /**
     * Reads a job's workspace block.
     *
     * <h2>Two spellings, one meaning</h2>
     *
     * The section is {@code workspace}. It is also accepted as {@code workplace}, which is what the
     * shipped {@code jobs.yml} used while this looked only for {@code workspace} — so every job fell
     * through to {@link Job.WorkspaceSpec#DISABLED} and no structure could be claimed at all, by
     * anyone, silently. The alias exists so an already-deployed configuration keeps working; the
     * canonical spelling matches the system's own name and everything else that refers to it.
     */
    private static Job.WorkspaceSpec workspace(ConfigurationSection body, String where, Logger logger) {
        ConfigurationSection section = body.getConfigurationSection("workspace");

        if (section == null) {
            section = body.getConfigurationSection("workplace");

            if (section != null) {
                logger.warning(where + " uses \"workplace\" for its workspace section. It still works,"
                        + " but rename it to \"workspace\" — the alias is only kept for existing files.");
            }
        }

        if (section == null || !section.getBoolean("enabled", true)) {
            return Job.WorkspaceSpec.DISABLED;
        }

        // Zero, not the region default, when unset: a job that says nothing about a radius means
        // "whatever the server is configured for", and baking a number in here would silently
        // override workspace.yml for every job that never mentioned the subject.
        return new Job.WorkspaceSpec(
                true,
                Ids.normalise(section.getString("npc", "")),
                section.getInt("protection-radius", 0));
    }

    private static Map<String, String> settings(ConfigurationSection section) {
        if (section == null) {
            return Map.of();
        }

        Map<String, String> values = new LinkedHashMap<>();

        for (String key : section.getKeys(false)) {
            Object value = section.get(key);
            if (value != null) {
                values.put(key, String.valueOf(value));
            }
        }

        return values;
    }
}
