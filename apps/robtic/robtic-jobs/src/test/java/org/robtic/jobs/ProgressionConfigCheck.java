package org.robtic.jobs;

import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Checks the progression config files against each other before the server ever sees them.
 *
 * <h2>What this catches that the compiler cannot</h2>
 *
 * The parsers are all deliberately forgiving: a job naming a recruiter that does not exist logs a
 * warning and carries on, because refusing to load would take a whole profession off the server over
 * one typo. That is right at runtime and useless as a safety net — the warning scrolls past in a
 * console nobody is reading, and the first anybody hears of it is a player standing in a guild hall
 * with no NPC in it.
 *
 * So the cross-file references are verified here, where a mistake fails loudly and immediately:
 *
 * <ul>
 *   <li>every {@code rarity} and {@code source} a title names exists</li>
 *   <li>every {@code recruiter} and {@code workspace.npc} a job names exists in npc.yml</li>
 *   <li>every NPC {@code job} names a real job</li>
 *   <li>no two titles share an id, across titles.yml <em>and</em> every job's milestone ladder</li>
 *   <li>no milestone sits above its job's level cap, where it could never be reached</li>
 *   <li>every message key the code asks for is present in messages.yml</li>
 *   <li>ids are valid where they are used as permission fragments and placeholder arguments</li>
 * </ul>
 *
 * <p>Run with {@code mvn test-compile exec:java -Dexec.classpathScope=test
 * -Dexec.mainClass=org.robtic.jobs.ProgressionConfigCheck}.
 */
public final class ProgressionConfigCheck {

    private static final List<String> FAILURES = new ArrayList<>();
    private static int checks;

    public static void main(String[] args) {
        Map<String, Object> titles = load("titles.yml");
        Map<String, Object> jobs = load("jobs.yml");
        Map<String, Object> npcs = load("npc.yml");
        Map<String, Object> workspace = load("workspace.yml");
        Map<String, Object> messages = load("messages.yml");
        Map<String, Object> statistics = load("statistics.yml");
        Map<String, Object> licenses = load("licenses.yml");

        checkTitles(titles);
        checkJobs(jobs, npcs, titles, licenses);
        checkNpcs(npcs, jobs);
        checkDuplicateTitleIds(titles, jobs);
        checkWorkspace(workspace, npcs, licenses);
        checkMarkerRoles(load("markers.yml"), jobs, workspace);
        checkStatistics(statistics);
        checkMessages(messages);

        System.out.println();
        System.out.println(FAILURES.isEmpty()
                ? "All " + checks + " progression config checks passed."
                : FAILURES.size() + " of " + checks + " checks FAILED:");

        FAILURES.forEach(failure -> System.out.println("  ✗ " + failure));

        if (!FAILURES.isEmpty()) {
            System.exit(1);
        }
    }

    // ─── Titles ───────────────────────────────────────────────────────────────────────────────

    private static void checkTitles(Map<String, Object> root) {
        Set<String> rarities = section(root, "rarities").keySet();
        Set<String> sources = section(root, "sources").keySet();

        require(!rarities.isEmpty(), "titles.yml defines at least one rarity");
        require(!sources.isEmpty(), "titles.yml defines at least one source");

        section(root, "titles").forEach((id, value) -> {
            if (!(value instanceof Map<?, ?> body)) {
                fail("titles.yml → " + id + " is not a section");
                return;
            }

            requireValidId(id, "titles.yml → " + id);

            String rarity = string(body, "rarity", "common");
            require(rarities.contains(rarity),
                    "titles.yml → " + id + " names the rarity \"" + rarity + "\", which exists");

            String source = string(body, "source", "custom");
            require(sources.contains(source),
                    "titles.yml → " + id + " names the source \"" + source + "\", which exists");

            checkUnlockPaths(body, "titles.yml → " + id);
        });
    }

    /**
     * Verifies that unlock conditions reference an attribute namespace something actually publishes.
     *
     * A condition on {@code jobb.miner.level} parses perfectly, evaluates to "not satisfied" forever,
     * and looks exactly like a title nobody has earned yet.
     */
    private static void checkUnlockPaths(Map<?, ?> body, String where) {
        Object unlock = body.get("unlock");

        if (!(unlock instanceof List<?> list)) {
            return;
        }

        for (Object element : list) {
            if (!(element instanceof Map<?, ?> condition)) {
                continue;
            }

            String type = string(condition, "type", "");

            if (!type.startsWith("attribute-")) {
                continue;
            }

            String path = string(condition, "path", "");

            require(path.startsWith("job."),
                    where + " reads the attribute \"" + path + "\", whose namespace is published");
        }
    }

    // ─── Jobs ─────────────────────────────────────────────────────────────────────────────────

    private static void checkJobs(
            Map<String, Object> root,
            Map<String, Object> npcs,
            Map<String, Object> titles,
            Map<String, Object> licenses
    ) {
        Set<String> npcIds = section(npcs, "npcs").keySet();
        Set<String> rarities = section(titles, "rarities").keySet();
        Set<String> licenseIds = section(section(licenses, "licenses"), "licenses").keySet();

        Map<String, Object> jobs = section(root, "jobs");
        require(!jobs.isEmpty(), "jobs.yml defines at least one job");

        jobs.forEach((id, value) -> {
            if (!(value instanceof Map<?, ?> body)) {
                fail("jobs.yml → " + id + " is not a section");
                return;
            }

            String where = "jobs.yml → " + id;
            requireValidId(id, where);

            int maxLevel = integer(body, "max-level", 100);
            require(maxLevel >= 1 && maxLevel <= 1000, where + " has a max-level within 1..1000");

            String recruiter = string(body, "recruiter", id + "_recruiter");
            require(npcIds.contains(recruiter),
                    where + " names the recruiter \"" + recruiter + "\", which npc.yml defines");

            // A licence id licenses.yml does not define refuses every claim rather than allowing
            // them — see CoreLicenseGate. That is the safe direction at runtime and a silent one: the
            // profession simply becomes unclaimable, and the recruiter appears broken. Caught here
            // instead, where a typo fails the build rather than a player's evening.
            String license = string(body, "license", "");

            if (!license.isBlank()) {
                require(licenseIds.contains(license),
                        where + " requires the licence \"" + license
                                + "\", which licenses.yml defines");
            }

            // The section this check reads must be the one the parser reads. They disagreed once —
            // the file said `workplace`, the parser looked for `workspace`, and this check looked for
            // `workspace` too, so it passed while every job in the file silently had no workspace and
            // no structure on the server could be claimed. Both spellings are looked at here, and the
            // legacy one is a failure rather than a pass.
            require(!body.containsKey("workplace"),
                    where + " spells its workspace section \"workspace\" (\"workplace\" is a legacy "
                            + "alias the server warns about)");

            if (body.get("workspace") instanceof Map<?, ?> workspace) {
                boolean enabled = !Boolean.FALSE.equals(workspace.get("enabled"));
                String npc = string(workspace, "npc", "");

                if (enabled && !npc.isBlank()) {
                    require(npcIds.contains(npc),
                            where + " names the workspace NPC \"" + npc + "\", which npc.yml defines");

                    // A workspace NPC is reached through the SELLER branch of the interaction
                    // listener. One defined as anything else is spawned, stands there, and does
                    // nothing at all when a player clicks it.
                    require("SELLER".equals(npcKind(npcs, npc)),
                            where + " names the workspace NPC \"" + npc + "\", which is kind SELLER");
                }

                require(integer(workspace, "protection-radius", 0) >= 0,
                        where + " has a non-negative protection radius");
            }

            checkRewards(body, where);
            checkPrices(body, where);
            checkMilestones(body, where, maxLevel, rarities);
        });

        // The premium ladder from the spec: free 1/1, tier 1 2/1, tier 2 3/2.
        if (root.get("limits") instanceof Map<?, ?> limits) {
            checkLimits(limits);
        }
    }

    private static void checkRewards(Map<?, ?> body, String where) {
        if (!(body.get("rewards") instanceof Map<?, ?> rewards)) {
            return;
        }

        rewards.forEach((key, value) -> {
            require(value instanceof Number && ((Number) value).doubleValue() > 0,
                    where + " → rewards → " + key + " is a positive number");

            String action = String.valueOf(key);

            require(action.indexOf(':') > 0,
                    where + " → rewards → " + key + " is a \"<verb>:<target>\" key");
        });
    }

    /**
     * Prices must be non-negative, and a player-market floor must not sit below the server price.
     *
     * A floor below the server price would let a listing be bought and flipped straight back to the
     * NPC at a profit, which turns the player market into an arbitrage machine rather than a market.
     */
    private static void checkPrices(Map<?, ?> body, String where) {
        if (!(body.get("prices") instanceof Map<?, ?> prices)) {
            return;
        }

        prices.forEach((key, value) -> {
            if (value instanceof Number number) {
                require(number.doubleValue() >= 0,
                        where + " → prices → " + key + " is not negative");
                return;
            }

            if (value instanceof Map<?, ?> price) {
                double server = number(price, "server", 0);
                double minimum = number(price, "minimum", server);

                require(server >= 0, where + " → prices → " + key + " server price is not negative");
                require(minimum >= server,
                        where + " → prices → " + key + " minimum is at or above the server price");
                return;
            }

            fail(where + " → prices → " + key + " is neither a number nor a section");
        });
    }

    private static void checkMilestones(Map<?, ?> body, String where, int maxLevel, Set<String> rarities) {
        if (!(body.get("titles") instanceof Map<?, ?> milestones)) {
            return;
        }

        milestones.forEach((levelKey, value) -> {
            int level;

            try {
                level = Integer.parseInt(String.valueOf(levelKey).trim());
            } catch (NumberFormatException notANumber) {
                fail(where + " → titles → " + levelKey + " is not a level number");
                return;
            }

            require(level >= 1, where + " → titles → " + levelKey + " is at least level 1");
            require(level <= maxLevel,
                    where + " → titles → " + levelKey + " is at or below the job's max-level of " + maxLevel);

            if (!(value instanceof Map<?, ?> title)) {
                fail(where + " → titles → " + levelKey + " is not a section");
                return;
            }

            String id = string(title, "id", "");
            require(!id.isBlank(), where + " → titles → " + levelKey + " has an id");
            requireValidId(id, where + " → titles → " + levelKey);

            String rarity = string(title, "rarity", "common");
            require(rarities.contains(rarity),
                    where + " → titles → " + levelKey + " names the rarity \"" + rarity + "\", which exists");
        });
    }

    private static void checkLimits(Map<?, ?> limits) {
        if (limits.get("default") instanceof Map<?, ?> base) {
            require(integer(base, "active", 1) <= integer(base, "owned", 1),
                    "jobs.yml → limits → default has active no higher than owned");
        }

        if (limits.get("tiers") instanceof Map<?, ?> tiers) {
            tiers.forEach((tier, value) -> {
                if (value instanceof Map<?, ?> limit) {
                    require(integer(limit, "active", 1) <= integer(limit, "owned", 1),
                            "jobs.yml → limits → tier " + tier + " has active no higher than owned");
                }
            });
        }
    }

    // ─── NPCs ─────────────────────────────────────────────────────────────────────────────────

    private static void checkNpcs(Map<String, Object> root, Map<String, Object> jobsRoot) {
        Set<String> jobIds = section(jobsRoot, "jobs").keySet();
        Set<String> kinds = Set.of("RECRUITER", "SELLER", "DECORATION");

        section(root, "npcs").forEach((id, value) -> {
            if (!(value instanceof Map<?, ?> body)) {
                fail("npc.yml → " + id + " is not a section");
                return;
            }

            String where = "npc.yml → " + id;
            requireValidId(id, where);

            String kind = string(body, "kind", "RECRUITER").toUpperCase(Locale.ROOT);
            require(kinds.contains(kind), where + " has a valid kind (was \"" + kind + "\")");

            String job = string(body, "job", "");

            if (!job.isBlank()) {
                require(jobIds.contains(job),
                        where + " names the job \"" + job + "\", which jobs.yml defines");
            }

            // A recruiter with no job can never offer anything, which is silent and confusing.
            if ("RECRUITER".equals(kind)) {
                require(!job.isBlank(), where + " is a recruiter and names a job");
            }
        });
    }

    /**
     * No two titles may share an id, across both files.
     *
     * The runtime registry reports a duplicate and keeps the first — correct behaviour, and it means
     * a job silently grants somebody else's title. Worth failing the build over.
     */
    private static void checkDuplicateTitleIds(Map<String, Object> titles, Map<String, Object> jobs) {
        Set<String> seen = new HashSet<>(section(titles, "titles").keySet());

        section(jobs, "jobs").forEach((jobId, value) -> {
            if (!(value instanceof Map<?, ?> body) || !(body.get("titles") instanceof Map<?, ?> milestones)) {
                return;
            }

            milestones.forEach((level, entry) -> {
                if (!(entry instanceof Map<?, ?> title)) {
                    return;
                }

                String id = string(title, "id", "");

                if (id.isBlank()) {
                    return;
                }

                require(seen.add(id),
                        "the title id \"" + id + "\" (jobs.yml → " + jobId + " → " + level + ") is unique");
            });
        });
    }

    // ─── Workspace ────────────────────────────────────────────────────────────────────────────

    /**
     * Checks the upgrade ladder and the NPC roles.
     *
     * The two things worth failing a build over are a gap in the tier numbering, which makes every
     * tier above it permanently unreachable, and a role naming an NPC that does not exist, which
     * produces a workspace that silently never staffs itself.
     */
    private static void checkWorkspace(
            Map<String, Object> root,
            Map<String, Object> npcs,
            Map<String, Object> licenses
    ) {
        // The licence ids workspace.yml is allowed to name. Read here rather than passed down from
        // checkJobs, so the two checks cannot drift apart over which file is authoritative.
        Set<String> licenseIds = section(section(licenses, "licenses"), "licenses").keySet();

        Map<String, Object> config = section(root, "workspace");

        if (config.isEmpty()) {
            fail("workspace.yml has no \"workspace\" section");
            return;
        }

        Set<String> npcIds = section(npcs, "npcs").keySet();

        // ─── Region ───────────────────────────────────────────────────────────────────────────

        if (config.get("region") instanceof Map<?, ?> region) {
            int radius = integer(region, "radius", 16);
            int depth = integer(region, "depth", 8);
            int height = integer(region, "height", 32);

            require(radius >= 1, "workspace.yml → region → radius is at least 1");
            require(depth >= 0, "workspace.yml → region → depth is not negative");
            require(height >= 1, "workspace.yml → region → height is at least 1");

            // The same arithmetic the claim path runs, so an operator learns here rather than when
            // the first player finds a structure and is refused.
            long volume = (long) (radius * 2 + 1) * (depth + height + 1) * (radius * 2 + 1);
            long max = integer(region, "max-volume", 250_000);

            require(volume <= max, "workspace.yml → region: the configured volume (" + volume
                    + ") is within max-volume (" + max + ")");
        }

        // ─── Base levels ──────────────────────────────────────────────────────────────────────

        require(!rawSection(config, "base-levels").isEmpty(),
                "workspace.yml defines at least one base level");

        Set<String> roleIds = section(config, "npc-roles").keySet();
        int expected = 1;
        int previousNpcWorkers = -1;
        int previousPlayerWorkers = -1;
        int highestBaseLevel = 0;

        // Every unlock any level grants, so an upgrade gated on one that does not exist can be
        // reported rather than silently never appearing in a menu.
        Set<String> declaredUnlocks = new LinkedHashSet<>();

        // Keys are read through Object, not String: SnakeYAML parses an unquoted `1:` as an Integer
        // key, and Bukkit's YAML reader turns the same key into a String. Assuming either one is how
        // this check threw a ClassCastException on a file the server itself reads perfectly.
        for (Object rawKey : rawSection(config, "base-levels").keySet()) {
            String key = String.valueOf(rawKey);
            int level;

            try {
                level = Integer.parseInt(key.trim());
            } catch (NumberFormatException notANumber) {
                fail("workspace.yml → base-levels → " + key + " is not a level number");
                continue;
            }

            // A gap makes everything above it unreachable: nothing can upgrade past the hole.
            require(level == expected,
                    "workspace.yml → base-levels: level " + expected
                            + " is present (no gaps in the ladder)");
            expected++;
            highestBaseLevel = Math.max(highestBaseLevel, level);

            if (!(rawSection(config, "base-levels").get(rawKey) instanceof Map<?, ?> base)) {
                fail("workspace.yml → base-levels → " + key + " is not a section");
                continue;
            }

            require(integer(base, "cost", 0) >= 0,
                    "workspace.yml → base-levels → " + key + " has a non-negative cost");

            int npcWorkers = 0;
            int playerWorkers = 0;

            if (base.get("workers") instanceof Map<?, ?> workers) {
                npcWorkers = integer(workers, "npc", 0);
                playerWorkers = integer(workers, "player", 0);
            }

            require(npcWorkers >= 0 && playerWorkers >= 0,
                    "workspace.yml → base-levels → " + key + " has non-negative worker limits");

            // A limit that shrinks as the business grows would make an upgrade fire staff — and the
            // worker system has no answer for which of them to dismiss.
            require(npcWorkers >= previousNpcWorkers,
                    "workspace.yml → base-levels → " + key
                            + " does not reduce the NPC worker limit below the level beneath it");
            require(playerWorkers >= previousPlayerWorkers,
                    "workspace.yml → base-levels → " + key
                            + " does not reduce the player worker limit below the level beneath it");

            previousNpcWorkers = npcWorkers;
            previousPlayerWorkers = playerWorkers;

            if (base.get("npcs") instanceof List<?> roles) {
                for (Object role : roles) {
                    require(roleIds.contains(String.valueOf(role)),
                            "workspace.yml → base-levels → " + key + " names the NPC role \"" + role
                                    + "\", which npc-roles defines");
                }
            }

            if (base.get("unlocks") instanceof List<?> unlocks) {
                for (Object unlock : unlocks) {
                    declaredUnlocks.add(String.valueOf(unlock).toLowerCase(Locale.ROOT));
                }
            }
        }

        // ─── Workspace upgrades ───────────────────────────────────────────────────────────────
        //
        // The second axis. Two mistakes here are invisible at runtime — an upgrade simply never
        // appears in the menu, or appears permanently locked — and neither is distinguishable from
        // a deliberate gate without reading the file.

        Map<String, Integer> upgradeMaxLevels = new LinkedHashMap<>();

        for (Object rawId : rawSection(config, "upgrades").keySet()) {
            String id = String.valueOf(rawId);

            if (rawSection(config, "upgrades").get(rawId) instanceof Map<?, ?> upgrade
                    && upgrade.get("levels") instanceof Map<?, ?> levels) {
                upgradeMaxLevels.put(id.toLowerCase(Locale.ROOT), levels.size());
            }
        }

        for (Object rawId : rawSection(config, "upgrades").keySet()) {
            String id = String.valueOf(rawId);

            requireValidId(id, "workspace.yml → upgrades → " + id);

            if (!(rawSection(config, "upgrades").get(rawId) instanceof Map<?, ?> upgrade)) {
                fail("workspace.yml → upgrades → " + id + " is not a section");
                continue;
            }

            String requiresUnlock = string(upgrade, "requires-unlock", "").toLowerCase(Locale.ROOT);

            if (!requiresUnlock.isEmpty()) {
                require(declaredUnlocks.contains(requiresUnlock),
                        "workspace.yml → upgrades → " + id + " requires the unlock \"" + requiresUnlock
                                + "\", which a base level grants");
            }

            if (!(upgrade.get("levels") instanceof Map<?, ?> levels) || levels.isEmpty()) {
                fail("workspace.yml → upgrades → " + id + " defines at least one level");
                continue;
            }

            int expectedStep = 1;
            double previousValue = -1d;
            int previousMinBase = 0;

            for (Object rawStep : levels.keySet()) {
                String stepKey = String.valueOf(rawStep);
                int step;

                try {
                    step = Integer.parseInt(stepKey.trim());
                } catch (NumberFormatException notANumber) {
                    fail("workspace.yml → upgrades → " + id + " → " + stepKey + " is not a level number");
                    continue;
                }

                require(step == expectedStep, "workspace.yml → upgrades → " + id + ": level "
                        + expectedStep + " is present (no gaps)");
                expectedStep++;

                if (!(levels.get(rawStep) instanceof Map<?, ?> body)) {
                    fail("workspace.yml → upgrades → " + id + " → " + stepKey + " is not a section");
                    continue;
                }

                require(integer(body, "cost", 0) >= 0,
                        "workspace.yml → upgrades → " + id + " → " + stepKey + " has a non-negative cost");

                int minBase = integer(body, "min-base-level", 1);

                // A step nothing can reach is a permanently greyed-out menu entry, which reads as a
                // bug to the only person who can fix it.
                require(minBase <= highestBaseLevel, "workspace.yml → upgrades → " + id + " → "
                        + stepKey + " requires base level " + minBase
                        + ", which the ladder reaches");

                // Requirements that fall as the upgrade climbs mean a later step is buyable before
                // an earlier one, which the one-step-at-a-time purchase path cannot express.
                require(minBase >= previousMinBase, "workspace.yml → upgrades → " + id + " → "
                        + stepKey + " does not require a lower base level than the step below it");
                previousMinBase = minBase;

                double value = number(body, "value", 0d);

                require(value >= previousValue, "workspace.yml → upgrades → " + id + " → " + stepKey
                        + " does not grant less than the step below it");
                previousValue = value;

                if (body.get("requires") instanceof Map<?, ?> requires) {
                    requires.forEach((dependency, atLeast) -> {
                        String other = String.valueOf(dependency).toLowerCase(Locale.ROOT);

                        require(upgradeMaxLevels.containsKey(other),
                                "workspace.yml → upgrades → " + id + " → " + stepKey
                                        + " depends on the upgrade \"" + other + "\", which is defined");

                        Integer max = upgradeMaxLevels.get(other);
                        int needed = atLeast instanceof Number n ? n.intValue() : 1;

                        require(max == null || needed <= max,
                                "workspace.yml → upgrades → " + id + " → " + stepKey
                                        + " depends on " + other + " level " + needed
                                        + ", which that upgrade reaches");
                    });
                }
            }
        }

        // The storage upgrade named in the storage section has to exist, or every business is stuck
        // at the base capacity with no way to raise it and nothing to say why.
        if (config.get("storage") instanceof Map<?, ?> storageSection) {
            String storageUpgrade =
                    string(storageSection, "upgrade", "storage").toLowerCase(Locale.ROOT);

            require(upgradeMaxLevels.containsKey(storageUpgrade),
                    "workspace.yml → storage → upgrade names \"" + storageUpgrade
                            + "\", which upgrades defines");
        }

        // ─── Licences ─────────────────────────────────────────────────────────────────────────

        if (config.get("license") instanceof Map<?, ?> license) {
            String operating = string(license, "id", "workspace");
            String manager = string(license, "manager-id", "manager");

            require(licenseIds.contains(operating), "workspace.yml → license → id names \""
                    + operating + "\", which licenses.yml defines");
            require(licenseIds.contains(manager), "workspace.yml → license → manager-id names \""
                    + manager + "\", which licenses.yml defines");

            require(integer(license, "grace-minutes", 0) >= 0,
                    "workspace.yml → license → grace-minutes is not negative");

            // Unsorted thresholds fire the wrong warning: the lifecycle picks the first one the
            // remaining time has fallen below. The parser sorts them, but a file that looks sorted
            // and is not is worth reporting to whoever wrote it.
            if (license.get("warn-before-minutes") instanceof List<?> warnings) {
                long previous = Long.MAX_VALUE;
                boolean descending = true;

                for (Object warning : warnings) {
                    long minutes = warning instanceof Number n ? n.longValue() : -1L;

                    require(minutes > 0, "workspace.yml → license → warn-before-minutes: " + warning
                            + " is a positive number of minutes");

                    if (minutes > previous) {
                        descending = false;
                    }

                    previous = minutes;
                }

                require(descending,
                        "workspace.yml → license → warn-before-minutes is ordered longest first");
            }
        }

        // ─── NPC roles ────────────────────────────────────────────────────────────────────────

        section(config, "npc-roles").forEach((id, value) -> {
            if (!(value instanceof Map<?, ?> role)) {
                fail("workspace.yml → npc-roles → " + id + " is not a section");
                return;
            }

            requireValidId(id, "workspace.yml → npc-roles → " + id);

            String npc = string(role, "npc", "");

            require(npcIds.contains(npc), "workspace.yml → npc-roles → " + id
                    + " names the NPC \"" + npc + "\", which npc.yml defines");

            // Same trap as a job's own workspace NPC: only the SELLER branch of the interaction
            // listener reaches a workspace NPC, so a role pointing at any other kind produces a
            // figure standing in the building that ignores every click.
            require("SELLER".equals(npcKind(npcs, npc)), "workspace.yml → npc-roles → " + id
                    + " names the NPC \"" + npc + "\", which is kind SELLER");
        });

        // The seller role must exist: every workspace has one, and its absence would mean a claimed
        // building with nothing in it.
        require(roleIds.contains("seller"), "workspace.yml defines the \"seller\" NPC role");

        // ─── Tax ──────────────────────────────────────────────────────────────────────────────

        if (config.get("tax") instanceof Map<?, ?> tax) {
            require(integer(tax, "interval-minutes", 10_080) >= 1,
                    "workspace.yml → tax → interval-minutes is at least 1");
            require(integer(tax, "base-amount", 500) >= 0,
                    "workspace.yml → tax → base-amount is not negative");
            require(integer(tax, "grace-minutes", 1_440) >= 0,
                    "workspace.yml → tax → grace-minutes is not negative");
        }
    }

    // ─── Statistics ───────────────────────────────────────────────────────────────────────────

    /**
     * Checks the statistic definitions and the vanilla recording map.
     *
     * <h2>What is worth failing a build over</h2>
     *
     * The runtime is deliberately forgiving here — an unknown type falls back to {@code long}, an
     * unknown category becomes a placeholder — because dropping a statistic would orphan every value
     * already recorded against it. That is right in production and useless as a safety net.
     *
     * The one mistake that is genuinely destructive is the {@code record} section naming a statistic
     * that does not exist: with {@code auto-register} off, which is the default, every one of those
     * events is silently discarded and the console says so once, hours before anybody notices the
     * counter has not moved. That is checked exhaustively.
     */
    /**
     * The join between RobticWorld's markers and this plugin's workspaces: NPC roles.
     *
     * <h2>Why this crosses three files</h2>
     *
     * A marker says "an NPC with role {@code seller} stands here". {@code workspace.yml} says "the
     * {@code seller} role is staffed by this NPC at these tiers". The two never reference each other
     * — that is the whole point of a role being a name — which also means nothing at runtime notices
     * when they stop agreeing. A renamed role produces a building with a marker nothing staffs and a
     * tier that staffs a role no marker places, and both halves look perfectly healthy in isolation.
     *
     * The recruiter is checked from the other direction: this plugin decides which roles mean
     * "recruiter", and a structure whose recruiter marker uses a role not in that set is scanned,
     * validated and then quietly ignored.
     */
    private static void checkMarkerRoles(
            Map<String, Object> markersFile,
            Map<String, Object> jobsFile,
            Map<String, Object> workspaceFile
    ) {
        Map<String, Object> types = section(section(markersFile, "markers"), "types");

        if (types.isEmpty()) {
            fail("markers.yml declares marker types");
            return;
        }

        Set<String> markerRoles = new HashSet<>();

        types.forEach((id, value) -> {
            if (value instanceof Map<?, ?> body) {
                String role = string(body, "npc-role", "");

                if (!role.isBlank()) {
                    markerRoles.add(role.toLowerCase(Locale.ROOT));
                }
            }
        });

        // Every workspace NPC role must be placeable by some marker, or the tier staffs a position
        // no builder can mark out.
        Set<String> workspaceRoles =
                section(section(workspaceFile, "workspace"), "npc-roles").keySet();

        for (String role : workspaceRoles) {
            require(markerRoles.contains(role.toLowerCase(Locale.ROOT)),
                    "workspace.yml → npc-roles → " + role + " is placed by a marker in markers.yml");
        }

        // The recruiter roles this plugin looks for. An empty list in jobs.yml means the shipped
        // defaults, which are named here for the same reason the statistics ids are: this check runs
        // against the resource files with no server classes on the classpath.
        List<String> configured = strings(section(jobsFile, "discovery"), "recruiter-roles");
        List<String> recruiterRoles =
                configured.isEmpty() ? List.of("recruiter", "recruiter_rare") : configured;

        boolean anyRecruiter = false;

        for (String role : recruiterRoles) {
            anyRecruiter |= markerRoles.contains(role.toLowerCase(Locale.ROOT));
        }

        require(anyRecruiter, "markers.yml defines a marker for at least one of the recruiter roles "
                + recruiterRoles + " that jobs.yml looks for");
    }

    /** A string list, tolerating the key being absent or holding something else. */
    private static List<String> strings(Map<String, Object> root, String key) {
        Object value = root.get(key);

        if (!(value instanceof List<?> list)) {
            return List.of();
        }

        List<String> found = new ArrayList<>();
        list.forEach(entry -> found.add(String.valueOf(entry)));

        return found;
    }

    private static void checkStatistics(Map<String, Object> root) {
        Map<String, Object> config = section(root, "statistics");

        if (config.isEmpty()) {
            fail("statistics.yml has no \"statistics\" section");
            return;
        }

        Set<String> categories = section(config, "categories").keySet();
        Map<String, Object> defined = section(config, "statistics");

        require(!defined.isEmpty(), "statistics.yml defines at least one statistic");

        // Every id ProgressionStatistics writes into. An undeclared one is not an error at runtime —
        // the service takes the write and nothing ever reads it back — so the counter simply stays
        // invisible, which is the failure mode this file exists to make impossible.
        for (String id : BRIDGE_STATISTICS) {
            require(defined.containsKey(id),
                    "statistics.yml declares \"" + id + "\", which ProgressionStatistics records into");
        }

        // Every type the code offers. Kept here rather than imported so this check runs without the
        // server classes on the classpath, exactly as the rest of this file does.
        Set<String> types = Set.of("long", "double", "boolean", "duration", "timestamp", "text");
        Set<String> policies = Set.of("never", "session", "daily", "weekly", "monthly");

        defined.forEach((id, value) -> {
            String where = "statistics.yml → statistics → " + id;

            if (!(value instanceof Map<?, ?> body)) {
                fail(where + " is not a section");
                return;
            }

            requireValidId(id, where);

            String type = string(body, "type", "long").toLowerCase(Locale.ROOT);
            require(types.contains(type), where + " has a known type (was \"" + type + "\")");

            String category = string(body, "category", "custom");
            require(categories.contains(category),
                    where + " names the category \"" + category + "\", which is declared");

            String reset = string(body, "reset", "never").toLowerCase(Locale.ROOT);
            require(policies.contains(reset), where + " has a known reset policy (was \"" + reset + "\")");

            // A text statistic cannot be accumulated into and a timestamp is not a running total.
            // Declaring either with a reset policy is legal; declaring one as the target of a
            // counting rule is not, and that is checked below where the rules are.
            if ("session".equals(reset)) {
                require(!Boolean.TRUE.equals(body.get("persistent")),
                        where + " does not claim to be both session-scoped and persistent");
            }
        });

        section(config, "categories").forEach((id, value) -> {
            requireValidId(id, "statistics.yml → categories → " + id);

            require(value instanceof Map, "statistics.yml → categories → " + id + " is a section");
        });

        checkRecordingRules(section(config, "record"), defined.keySet());
    }

    /**
     * Every id the {@code record} section points at must be a declared statistic.
     *
     * Walked generically rather than key by key: the section is a shallow tree of strings and
     * material/entity maps, so anything that is a string in a value position is a statistic id.
     * Enumerating the keys instead would mean this check silently stopped covering a recording rule
     * added later — which is the exact failure it exists to prevent.
     */
    private static void checkRecordingRules(Map<String, Object> record, Set<String> declared) {
        record.forEach((key, value) -> collectRecordedIds(value, "statistics.yml → record → " + key,
                (where, id) -> require(declared.contains(id),
                        where + " records into \"" + id + "\", which is a declared statistic")));
    }

    private static void collectRecordedIds(
            Object value, String where, java.util.function.BiConsumer<String, String> check) {

        if (value instanceof Map<?, ?> body) {
            body.forEach((key, nested) -> collectRecordedIds(nested, where + " → " + key, check));
            return;
        }

        if (value instanceof String id && !id.isBlank()) {
            check.accept(where, id);
        }
    }

    // ─── Messages ─────────────────────────────────────────────────────────────────────────────

    /**
     * Every message key the progression code asks for must exist.
     *
     * A missing one renders in game as {@code <missing message: …>}, which is visible but is
     * discovered by a player rather than by a build.
     */
    private static void checkMessages(Map<String, Object> messages) {
        for (String key : REQUIRED_MESSAGES) {
            require(resolve(messages, key) != null, "messages.yml defines \"" + key + "\"");
        }
    }

    /** Every key referenced from the progression sources. Kept in sync by this check failing. */
    /**
     * The statistic ids {@code ProgressionStatistics} writes.
     *
     * Duplicated from the constants in that class rather than imported, deliberately: this check runs
     * against the resource files with no server classes on the classpath, exactly as every other
     * check here does. The cost of that is this list, and the list is short and rarely changes.
     */
    private static final List<String> BRIDGE_STATISTICS = List.of(
            "workspaces_claimed",
            "workspace_upgrades",
            "workspace_tax_paid",
            "structures_discovered",
            "jobs_joined",
            "job_levels_gained",
            "titles_unlocked",
            "items_sold",
            "daily_items_sold",
            "robs_earned",
            "daily_robs_earned");

    private static final List<String> REQUIRED_MESSAGES = List.of(
            "progression.player-only",
            "progression.no-permission",
            "progression.not-loaded",
            "progression.jobs.joined",
            "progression.jobs.already-owned",
            "progression.jobs.limit-reached",
            "progression.jobs.no-permission",
            "progression.jobs.in-progress",
            "progression.jobs.unknown",
            "progression.jobs.cancelled",
            "progression.jobs.not-owned",
            "progression.jobs.recruiter-stale",
            "progression.jobs.activated",
            "progression.jobs.deactivated",
            "progression.jobs.already-active",
            "progression.jobs.active-limit",
            "progression.jobs.resign-confirm",
            "progression.jobs.resigned",
            "progression.jobs.usage-leave",
            "progression.jobs.usage-activate",
            "progression.jobs.none-owned",
            "progression.jobs.license-missing",
            "progression.jobs.license-expired",
            "progression.jobs.license-refused",
            "progression.jobs.stats-header",
            "progression.jobs.stats-entry",
            "progression.jobs.debug-header",
            "progression.jobs.debug-limits",
            "progression.jobs.debug-job",
            "progression.jobs.debug-workspaces",
            "progression.workspace.none-owned",
            "progression.workspace.none-for-profession",
            "progression.workspace.choose",
            "progression.workspace.choose-entry",
            "progression.workspace.markers-unavailable",
            "progression.titles.equipped",
            "progression.titles.unequipped",
            "progression.titles.cannot-equip",
            "progression.titles.locked",
            "progression.titles.none",
            "progression.titles.list-header",
            "progression.titles.list-entry",
            "progression.titles.usage-equip",
            "progression.titles.search-prompt",
            "progression.workspace.protected",
            "progression.gui.workspace.capabilities",
            "progression.gui.workspace.deposit",
            "progression.gui.workspace.deposit-hint",
            "progression.gui.workspace.level",
            "progression.gui.workspace.max-tier",
            "progression.gui.workspace.max-tier-hint",
            "progression.gui.workspace.name",
            "progression.gui.workspace.profession",
            "progression.gui.workspace.storage",
            "progression.gui.workspace.storage-empty",
            "progression.gui.workspace.storage-empty-hint",
            "progression.gui.workspace.storage-hint",
            "progression.gui.workspace.storage-title",
            "progression.gui.workspace.storage-used",
            "progression.gui.workspace.stored",
            "progression.gui.workspace.suspended",
            "progression.gui.workspace.tax",
            "progression.gui.workspace.tax-amount",
            "progression.gui.workspace.tax-disabled",
            "progression.gui.workspace.tax-due",
            "progression.gui.workspace.tax-hint",
            "progression.gui.workspace.tax-overdue",
            "progression.gui.workspace.tier-locked",
            "progression.gui.workspace.tier-reached",
            "progression.gui.workspace.tier-storage",
            "progression.gui.workspace.title",
            "progression.gui.workspace.upgrade",
            "progression.gui.workspace.upgrade-cost",
            "progression.gui.workspace.upgrade-feature",
            "progression.gui.workspace.upgrade-npc",
            "progression.gui.workspace.upgrade-safe",
            "progression.gui.workspace.upgrade-storage",
            "progression.gui.workspace.upgrade-title",
            "progression.gui.workspace.where",
            "progression.gui.workspace.withdraw-hint",
            "progression.workspace.already-owns",
            "progression.workspace.cannot-afford",
            "progression.workspace.claim-failed",
            "progression.workspace.claimed",
            "progression.workspace.deposited",
            "progression.workspace.disabled",
            "progression.workspace.gone",
            "progression.workspace.inventory-full",
            "progression.workspace.limit-reached",
            "progression.workspace.max-tier",
            "progression.workspace.not-ready",
            "progression.workspace.not-yours",
            "progression.workspace.nothing-storable",
            "progression.workspace.overlaps",
            "progression.workspace.protected",
            "progression.workspace.storage-full",
            "progression.workspace.structure-taken",
            "progression.workspace.suspended-npc",
            "progression.workspace.tax-not-due",
            "progression.workspace.tax-paid",
            "progression.workspace.tax-unpaid",
            "progression.workspace.suspended",
            "progression.workspace.too-large",
            "progression.workspace.upgrade-failed",
            "progression.workspace.upgrade-suspended",
            "progression.workspace.upgrade-vetoed",
            "progression.workspace.upgraded",
            "progression.workspace.world-unloaded",
            "progression.workspace.not-yours",
            "progression.workspace.unknown",
            "progression.sell.sold",
            "progression.sell.nothing",
            "progression.sell.refused",
            "progression.sell.quota",
            "progression.sell.cooldown",
            "progression.sell.failed",
            "progression.admin.usage",
            "progression.admin.usage-give",
            "progression.admin.usage-take",
            "progression.admin.usage-grant",
            "progression.admin.usage-revoke",
            "progression.admin.usage-info",
            "progression.admin.reloaded",
            "progression.admin.player-offline",
            "progression.admin.give-result",
            "progression.admin.took-job",
            "progression.admin.granted-title",
            "progression.admin.revoked-title",
            "progression.admin.already-owned",
            "progression.admin.not-owned",
            "progression.admin.info-header",
            "progression.admin.info-job",
            "progression.admin.info-titles",
            "progression.gui.back",
            "progression.gui.previous",
            "progression.gui.next",
            "progression.gui.titles.title",
            "progression.gui.titles.worn",
            "progression.gui.titles.click-to-equip",
            "progression.gui.titles.owned-but-locked",
            "progression.gui.titles.locked",
            "progression.gui.titles.from-source",
            "progression.gui.titles.sort",
            "progression.gui.titles.sort-hint",
            "progression.gui.titles.filter-rarity",
            "progression.gui.titles.filter-source",
            "progression.gui.titles.filter-all",
            "progression.gui.titles.filter-rarity-title",
            "progression.gui.titles.filter-source-title",
            "progression.gui.titles.search",
            "progression.gui.titles.search-none",
            "progression.gui.titles.clear",
            "progression.gui.titles.showing",
            "progression.gui.titles.hiding-none",
            "progression.gui.titles.owned-only",
            "progression.gui.titles.unequip",
            "progression.gui.titles.currently",
            "progression.gui.titles.refusal.not-owned",
            "progression.gui.titles.refusal.no-permission",
            "progression.gui.titles.refusal.not-loaded",
            "progression.gui.titles.refusal.unknown",
            "progression.gui.jobs.title",
            "progression.gui.jobs.detail-title",
            "progression.gui.jobs.none",
            "progression.gui.jobs.none-hint",
            "progression.gui.jobs.level",
            "progression.gui.jobs.xp",
            "progression.gui.jobs.active",
            "progression.gui.jobs.inactive",
            "progression.gui.jobs.click-detail",
            "progression.gui.jobs.limits",
            "progression.gui.jobs.limit-owned",
            "progression.gui.jobs.limit-active",
            "progression.gui.jobs.title-unlocked",
            "progression.gui.jobs.title-locked",
            "progression.gui.jobs.statistics",
            "progression.gui.jobs.stat-line",
            "progression.gui.jobs.stat-total",
            "progression.gui.jobs.no-stats",
            "progression.gui.jobs.activate",
            "progression.gui.jobs.activate-hint",
            "progression.gui.jobs.deactivate",
            "progression.gui.jobs.deactivate-hint",
            "progression.gui.jobs.sell",
            "progression.gui.jobs.sell-hint",
            "progression.gui.jobs.resign",
            "progression.gui.jobs.resign-warning",
            "progression.gui.jobs.workspace",
            "progression.gui.jobs.workspace-at",
            "progression.gui.jobs.workspace-hint");

    // ─── Helpers ──────────────────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static Map<String, Object> load(String name) {
        try (InputStream stream = ProgressionConfigCheck.class.getClassLoader()
                .getResourceAsStream(name)) {

            if (stream == null) {
                fail("could not find " + name + " on the classpath");
                return Map.of();
            }

            Object parsed = new Yaml().load(new java.io.InputStreamReader(stream, StandardCharsets.UTF_8));

            checks++;
            System.out.println("  ✓ " + name + " parses as YAML");

            return parsed instanceof Map ? (Map<String, Object>) parsed : Map.of();
        } catch (Exception failure) {
            fail(name + " could not be parsed: " + failure.getMessage());
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> section(Map<String, Object> root, String key) {
        Object value = root.get(key);
        return value instanceof Map ? (Map<String, Object>) value : Map.of();
    }

    /**
     * A section whose keys may not be strings.
     *
     * SnakeYAML parses an unquoted {@code 1:} as an Integer key; Bukkit's own reader turns the same
     * key into a String. Assuming either is how this check threw a ClassCastException on a file the
     * server reads perfectly — so anything keyed by a number is read through this instead.
     */
    private static Map<Object, Object> rawSection(Map<String, Object> root, String key) {
        Object value = root.get(key);

        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }

        Map<Object, Object> copy = new java.util.LinkedHashMap<>();
        map.forEach(copy::put);

        return copy;
    }

    /** Resolves a dotted key, since SnakeYAML gives back nested maps rather than a flat namespace. */
    private static Object resolve(Map<String, Object> root, String dotted) {
        Object current = root;

        for (String part : dotted.split("\\.")) {
            if (!(current instanceof Map<?, ?> map)) {
                return null;
            }
            current = map.get(part);
        }

        return current;
    }

    /** The declared kind of an NPC, uppercased, or empty when npc.yml has no such entry. */
    private static String npcKind(Map<String, Object> npcs, String id) {
        return section(npcs, "npcs").get(id) instanceof Map<?, ?> body
                ? string(body, "kind", "RECRUITER").toUpperCase(Locale.ROOT)
                : "";
    }

    private static String string(Map<?, ?> map, String key, String fallback) {
        Object value = map.get(key);
        return value == null ? fallback : String.valueOf(value);
    }

    private static int integer(Map<?, ?> map, String key, int fallback) {
        Object value = map.get(key);
        return value instanceof Number number ? number.intValue() : fallback;
    }

    private static double number(Map<?, ?> map, String key, double fallback) {
        Object value = map.get(key);
        return value instanceof Number number ? number.doubleValue() : fallback;
    }

    /** Ids become permission fragments and placeholder arguments, so the character set is narrow. */
    private static void requireValidId(Object id, String where) {
        require(String.valueOf(id).matches("[a-z0-9_]{1,48}"),
                where + " has an id usable in permissions and placeholders");
    }

    private static void require(boolean condition, String description) {
        checks++;

        if (condition) {
            System.out.println("  ✓ " + description);
        } else {
            FAILURES.add(description);
        }
    }

    private static void fail(String description) {
        checks++;
        FAILURES.add(description);
    }
}
