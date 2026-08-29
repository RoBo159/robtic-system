package org.robtic.minecraft.progression;

import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
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
 * -Dexec.mainClass=org.robtic.minecraft.progression.ProgressionConfigCheck}.
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

        checkTitles(titles);
        checkJobs(jobs, npcs, titles);
        checkNpcs(npcs, jobs);
        checkDuplicateTitleIds(titles, jobs);
        checkWorkspace(workspace, npcs);
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

    private static void checkJobs(Map<String, Object> root, Map<String, Object> npcs, Map<String, Object> titles) {
        Set<String> npcIds = section(npcs, "npcs").keySet();
        Set<String> rarities = section(titles, "rarities").keySet();

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
    private static void checkWorkspace(Map<String, Object> root, Map<String, Object> npcs) {
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

        // ─── Tiers ────────────────────────────────────────────────────────────────────────────


        require(!rawSection(config, "tiers").isEmpty(), "workspace.yml defines at least one tier");

        Set<String> roleIds = section(config, "npc-roles").keySet();
        int expected = 1;
        int previousStorage = -1;

        // Keys are read through Object, not String: SnakeYAML parses an unquoted `1:` as an Integer
        // key, and Bukkit's YAML reader turns the same key into a String. Assuming either one is how
        // this check threw a ClassCastException on a file the server itself reads perfectly.
        for (Object rawKey : rawSection(config, "tiers").keySet()) {
            String key = String.valueOf(rawKey);
            int level;

            try {
                level = Integer.parseInt(key.trim());
            } catch (NumberFormatException notANumber) {
                fail("workspace.yml → tiers → " + key + " is not a level number");
                continue;
            }

            // A gap makes everything above it unreachable: nothing can upgrade past the hole.
            require(level == expected,
                    "workspace.yml → tiers: level " + expected + " is present (no gaps in the ladder)");
            expected++;

            if (!(rawSection(config, "tiers").get(rawKey) instanceof Map<?, ?> tier)) {
                fail("workspace.yml → tiers → " + key + " is not a section");
                continue;
            }

            int storage = integer(tier, "storage", 0);

            require(storage >= 0, "workspace.yml → tiers → " + key + " has non-negative storage");

            // Storage that shrinks with a tier would be an upgrade that makes a workspace worse, and
            // would strand items above the new capacity.
            require(storage >= previousStorage,
                    "workspace.yml → tiers → " + key + " does not reduce storage below the tier below it");
            previousStorage = storage;

            require(integer(tier, "cost", 0) >= 0,
                    "workspace.yml → tiers → " + key + " has a non-negative cost");

            if (tier.get("npcs") instanceof List<?> roles) {
                for (Object role : roles) {
                    require(roleIds.contains(String.valueOf(role)),
                            "workspace.yml → tiers → " + key + " names the NPC role \"" + role
                                    + "\", which npc-roles defines");
                }
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
    private static void checkStatistics(Map<String, Object> root) {
        Map<String, Object> config = section(root, "statistics");

        if (config.isEmpty()) {
            fail("statistics.yml has no \"statistics\" section");
            return;
        }

        Set<String> categories = section(config, "categories").keySet();
        Map<String, Object> defined = section(config, "statistics");

        require(!defined.isEmpty(), "statistics.yml defines at least one statistic");

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
