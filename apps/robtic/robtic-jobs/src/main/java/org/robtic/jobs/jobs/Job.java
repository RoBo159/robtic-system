package org.robtic.jobs.jobs;

import org.bukkit.Material;
import org.robtic.core.registry.Identified;
import org.robtic.jobs.market.SellPrice;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/**
 * A profession, entirely as configured.
 *
 * <h2>Nothing about any specific job is in code</h2>
 *
 * There is no {@code MinerJob}, no {@code switch} on job id, and no interface a job implements.
 * Miner is a section in {@code jobs.yml}; so is Farmer; so is the Beekeeper a server adds next year.
 * Everything that varies between professions — which actions pay, how fast levels come, what the
 * NPC looks like, what the titles are, what the sell prices are — is data on this record.
 *
 * That is what "future jobs should require no code changes" has to mean. The test is simple: if a
 * new job would need a recompile, something that should have been a field is a class instead.
 *
 * <h2>Jobs depend on Titles, never the reverse</h2>
 *
 * {@link #milestones} maps a level to a title id. The job system reads it and calls the title
 * service; the title system is never told that jobs exist. See {@link Title} for why that direction
 * is the one that matters.
 *
 * @param id          stable identifier, e.g. {@code miner}
 * @param display     shown to players, may contain {@code &} codes
 * @param icon        material for the GUI entry
 * @param description tooltip lines
 * @param maxLevel    the level cap, already clamped and reflected in {@link #curve}
 * @param curve       XP-to-level conversion, precomputed
 * @param milestones  level → title id, ordered by level so "next title" is a lookup not a scan
 * @param rewards     action key → XP, e.g. {@code break:DIAMOND_ORE} → 25. See {@link JobAction}
 * @param prices      item key → what it sells for. Keys are uppercase material or custom item ids
 * @param permission  optional node required to claim it at all, for staff-only or event jobs
 * @param license     optional id of a RobticCore licence the player must hold to claim it. Empty
 *                    means ungated, which is what a job that says nothing about licences gets — see
 *                    {@code JobLicenseGate}
 * @param recruiter   id of the NPC definition that offers this job at a structure
 * @param workspace   what claiming it turns the structure into
 * @param settings    an open bag for anything a future module hangs off a job
 */
public record Job(
        String id,
        String display,
        Material icon,
        List<String> description,
        int maxLevel,
        XpCurve curve,
        TreeMap<Integer, String> milestones,
        Map<String, Double> rewards,
        Map<String, SellPrice> prices,
        Optional<String> permission,
        Optional<String> license,
        String recruiter,
        WorkspaceSpec workspace,
        Map<String, String> settings
) implements Identified {

    public Job {
        description = List.copyOf(description);
        milestones = new TreeMap<>(milestones);
        rewards = Map.copyOf(rewards);
        prices = Map.copyOf(prices);
        settings = Map.copyOf(settings);
    }

    public net.kyori.adventure.text.Component name() {
        return org.robtic.core.util.Chat.component(display);
    }

    /**
     * XP for an action, checking the exact key before the verb wildcard.
     *
     * Specific-then-wildcard rather than the reverse, so {@code break:*} can be a baseline that
     * individual blocks override. The other order would make every override dead config.
     *
     * @return empty when this job rewards nothing for the action, which is the common case — a Miner
     *         is asked about every crop a Farmer harvests and must answer cheaply
     */
    public Optional<Double> xpFor(JobAction action) {
        Double exact = rewards.get(action.key());

        if (exact != null) {
            return Optional.of(exact);
        }

        return Optional.ofNullable(rewards.get(action.wildcardKey()));
    }

    public Optional<SellPrice> priceOf(String itemKey) {
        return Optional.ofNullable(prices.get(itemKey.toUpperCase(java.util.Locale.ROOT)));
    }

    /** The title this job grants on reaching a level, if any. */
    public Optional<String> milestoneAt(int level) {
        return Optional.ofNullable(milestones.get(level));
    }

    /** Every milestone at or below a level — what a player of that level should already own. */
    public Map<Integer, String> milestonesUpTo(int level) {
        return milestones.headMap(level, true);
    }

    /** The next milestone above a level, for the "next unlock" line in the GUI. */
    public Optional<Map.Entry<Integer, String>> nextMilestoneAfter(int level) {
        return Optional.ofNullable(milestones.higherEntry(level));
    }

    /** A setting written by whichever module put it there. Never read by the job system itself. */
    public Optional<String> setting(String key) {
        return Optional.ofNullable(settings.get(key));
    }

    /**
     * What claiming a job turns the discovered structure into.
     *
     * @param enabled          whether claiming creates a workspace at all. A job can exist without
     *                         one — an event job handed out by command has no structure to convert
     * @param npc              id of the NPC definition that staffs the workspace's seller role once
     *                         claimed, overriding the generic one in {@code workspace.yml}. Blank
     *                         to use the generic one
     * @param protectionRadius blocks around the anchor only the owner may build in or interact with.
     *                         Zero uses the server-wide radius from {@code workspace.yml}, which is
     *                         what a job that does not mention a radius should get
     */
    public record WorkspaceSpec(
            boolean enabled,
            String npc,
            int protectionRadius
    ) {
        public WorkspaceSpec {
            // A negative radius is a mistake that would otherwise make every containment check pass
            // and quietly protect nothing.
            protectionRadius = Math.max(0, protectionRadius);
            npc = npc == null ? "" : npc;
        }

        public static final WorkspaceSpec DISABLED = new WorkspaceSpec(false, "", 0);

        /** The seller NPC this job wants, when it names one. */
        public Optional<String> sellerNpc() {
            return npc.isBlank() ? Optional.empty() : Optional.of(npc);
        }
    }
}
