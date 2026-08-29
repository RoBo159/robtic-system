package org.robtic.minecraft.progression.gui;

import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.progression.jobs.Job;
import org.robtic.minecraft.progression.jobs.JobLimits;
import org.robtic.minecraft.progression.jobs.JobProgress;
import org.robtic.minecraft.progression.jobs.JobService;
import org.robtic.minecraft.progression.jobs.PlayerJobs;
import org.robtic.minecraft.progression.market.SellService;
import org.robtic.minecraft.progression.titles.TitleService;
import org.robtic.minecraft.progression.workspace.WorkspaceService;
import org.robtic.minecraft.util.Chat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The jobs menu and one job's detail page.
 *
 * <h2>Owned jobs only</h2>
 *
 * This menu lists what a player has, not what exists. Jobs are discovered by exploring — that is the
 * stated design — and a browsable catalogue of every profession would undo it entirely: nobody
 * explores for something they can read about in a menu. A player with no jobs sees an explanation of
 * how to find one, which is the only hint the menu gives.
 */
public final class JobMenu {

    private static final int SIZE = 54;

    private final JobService jobs;
    private final TitleService titles;
    private final WorkspaceService workspaces;
    private final SellService sell;
    private final MessageCatalog messages;

    public JobMenu(
            JobService jobs,
            TitleService titles,
            WorkspaceService workspaces,
            SellService sell,
            MessageCatalog messages
    ) {
        this.jobs = jobs;
        this.titles = titles;
        this.workspaces = workspaces;
        this.sell = sell;
        this.messages = messages;
    }

    public void open(Player player) {
        player.openInventory(build(player));
    }

    public void openDetail(Player player, String jobId) {
        jobs.catalog().job(jobId)
                .ifPresent(job -> player.openInventory(buildDetail(player, job)));
    }

    /** The overview: one icon per owned job, with its level and progress. */
    public Inventory build(Player player) {
        UUID playerId = player.getUniqueId();
        PlayerJobs owned = jobs.jobsOf(playerId);
        JobLimits.Limit limit = jobs.limits().forPlayer(playerId);

        ProgressionHolder holder = new ProgressionHolder(ProgressionHolder.View.JOBS, null);

        Inventory inventory = org.bukkit.Bukkit.createInventory(holder, SIZE,
                Chat.component(messages.text("progression.gui.jobs.title")));

        holder.attach(inventory);

        List<Job> list = jobs.ownedJobs(playerId);

        if (list.isEmpty()) {
            // A single explanatory item rather than an empty box. The one thing a player without a
            // job needs is to know that jobs are found by exploring, not chosen from here.
            inventory.setItem(22, MenuItems.of(Material.FILLED_MAP,
                    messages.text("progression.gui.jobs.none"),
                    messages.lines("progression.gui.jobs.none-hint").stream()
                            .map(component -> net.kyori.adventure.text.serializer.plain
                                    .PlainTextComponentSerializer.plainText().serialize(component))
                            .map(line -> "&7" + line)
                            .toList()));
        }

        for (int index = 0; index < list.size() && index < 45; index++) {
            Job job = list.get(index);
            inventory.setItem(index, jobIcon(playerId, job, owned));
            holder.bind(index, new ProgressionHolder.Action.OpenJob(job.id()));
        }

        for (int slot = 45; slot < SIZE; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        // The limits, stated plainly. A player at their cap should be able to see why rather than
        // discovering it at an NPC.
        inventory.setItem(49, MenuItems.of(Material.PAPER,
                messages.text("progression.gui.jobs.limits"),
                List.of(
                        messages.text("progression.gui.jobs.limit-owned",
                                "used", String.valueOf(owned.ownedCount()),
                                "max", describeLimit(limit.owned())),
                        messages.text("progression.gui.jobs.limit-active",
                                "used", String.valueOf(owned.activeCount()),
                                "max", describeLimit(limit.active())))));

        return inventory;
    }

    private static String describeLimit(int value) {
        // The tester permission yields Integer.MAX_VALUE, which would render as a nonsense number.
        return value >= Integer.MAX_VALUE ? "∞" : String.valueOf(value);
    }

    private org.bukkit.inventory.ItemStack jobIcon(UUID playerId, Job job, PlayerJobs owned) {
        Optional<JobProgress> progress = owned.progress(job.id());
        int level = jobs.levelOf(playerId, job.id());
        boolean active = owned.isActive(job.id());

        long xp = progress.map(JobProgress::totalXp).orElse(0L);

        List<String> lore = new ArrayList<>();

        lore.add(messages.text("progression.gui.jobs.level",
                "level", String.valueOf(level),
                "max", String.valueOf(job.maxLevel())));

        lore.add(MenuItems.progressBar(job.curve().progressWithinLevel(xp), 20));

        lore.add(messages.text("progression.gui.jobs.xp",
                "xp", MenuItems.number(xp),
                "next", MenuItems.number(job.curve().xpToNextLevel(xp))));

        lore.add("");
        lore.add(messages.text(active
                ? "progression.gui.jobs.active"
                : "progression.gui.jobs.inactive"));
        lore.add("");
        lore.add(messages.text("progression.gui.jobs.click-detail"));

        return active
                ? MenuItems.glowing(job.icon(), "&f" + job.display(), lore)
                : MenuItems.of(job.icon(), "&7" + job.display(), lore);
    }

    // ─── Detail ───────────────────────────────────────────────────────────────────────────────

    /**
     * One job's page: progress, statistics, its titles, and the actions.
     *
     * Titles are listed with their unlock levels because that is the progression ladder — a player
     * looking at their job wants to know what the next rung is, and this is where they look.
     */
    public Inventory buildDetail(Player player, Job job) {
        UUID playerId = player.getUniqueId();
        PlayerJobs owned = jobs.jobsOf(playerId);

        ProgressionHolder holder = new ProgressionHolder(ProgressionHolder.View.JOB_DETAIL, job.id());

        Inventory inventory = org.bukkit.Bukkit.createInventory(holder, SIZE,
                Chat.component(messages.text("progression.gui.jobs.detail-title",
                        "job", MenuItems.plain(job.display()))));

        holder.attach(inventory);

        for (int slot = 0; slot < SIZE; slot++) {
            inventory.setItem(slot, MenuItems.FILLER);
        }

        inventory.setItem(4, jobIcon(playerId, job, owned));

        drawMilestones(inventory, playerId, job);
        drawStatistics(inventory, playerId, job);
        drawActions(inventory, holder, playerId, job, owned);

        return inventory;
    }

    /** The title ladder, one item per milestone, marked owned or not. */
    private void drawMilestones(Inventory inventory, UUID playerId, Job job) {
        int slot = 19;

        for (Map.Entry<Integer, String> milestone : job.milestonesUpTo(job.maxLevel()).entrySet()) {
            if (slot > 25) {
                break;
            }

            int level = milestone.getKey();
            boolean unlocked = jobs.levelOf(playerId, job.id()) >= level;

            String name = titles.catalog().title(milestone.getValue())
                    .map(title -> MenuItems.legacy(title.color()) + MenuItems.plain(title.display()))
                    .orElse("&8" + milestone.getValue());

            inventory.setItem(slot, MenuItems.of(
                    unlocked ? Material.NAME_TAG : Material.GRAY_DYE,
                    unlocked ? name : "&8" + MenuItems.plain(name),
                    List.of(messages.text(unlocked
                                    ? "progression.gui.jobs.title-unlocked"
                                    : "progression.gui.jobs.title-locked",
                            "level", String.valueOf(level)))));

            slot++;
        }
    }

    /**
     * The job's counters, most-performed first.
     *
     * Only the top few. A long-running job accumulates a counter per block type it has ever rewarded,
     * and rendering all of them would fill the menu with entries nobody reads.
     */
    private void drawStatistics(Inventory inventory, UUID playerId, Job job) {
        Optional<JobProgress> progress = jobs.progress(playerId, job.id());

        if (progress.isEmpty()) {
            return;
        }

        List<String> lines = progress.get().statistics().counters().entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(10)
                .map(entry -> messages.text("progression.gui.jobs.stat-line",
                        "what", pretty(entry.getKey()),
                        "count", MenuItems.number(entry.getValue())))
                .toList();

        List<String> lore = new ArrayList<>(lines);

        if (lore.isEmpty()) {
            lore.add(messages.text("progression.gui.jobs.no-stats"));
        }

        lore.add("");
        lore.add(messages.text("progression.gui.jobs.stat-total",
                "count", MenuItems.number(progress.get().statistics().total())));

        inventory.setItem(31, MenuItems.of(Material.BOOK,
                messages.text("progression.gui.jobs.statistics"), lore));
    }

    /** Renders {@code break:DIAMOND_ORE} as {@code Break Diamond Ore}. */
    private static String pretty(String actionKey) {
        String[] parts = actionKey.split(":", 2);

        if (parts.length < 2) {
            return actionKey;
        }

        String verb = parts[0].substring(0, 1).toUpperCase(java.util.Locale.ROOT) + parts[0].substring(1);
        String target = parts[1].toLowerCase(java.util.Locale.ROOT).replace('_', ' ');

        return verb + " " + target;
    }

    private void drawActions(
            Inventory inventory,
            ProgressionHolder holder,
            UUID playerId,
            Job job,
            PlayerJobs owned
    ) {
        boolean active = owned.isActive(job.id());

        inventory.setItem(48, MenuItems.of(
                active ? Material.REDSTONE_TORCH : Material.TORCH,
                messages.text(active
                        ? "progression.gui.jobs.deactivate"
                        : "progression.gui.jobs.activate"),
                List.of(messages.text(active
                        ? "progression.gui.jobs.deactivate-hint"
                        : "progression.gui.jobs.activate-hint"))));

        holder.bind(48, active
                ? new ProgressionHolder.Action.DeactivateJob(job.id())
                : new ProgressionHolder.Action.ActivateJob(job.id()));

        // Selling is offered here only when the economy is actually wired up, rather than shown and
        // then failing on click.
        if (sell.economy().available() && !job.prices().isEmpty()) {
            inventory.setItem(49, MenuItems.of(Material.EMERALD,
                    messages.text("progression.gui.jobs.sell"),
                    List.of(messages.text("progression.gui.jobs.sell-hint"))));

            holder.bind(49, new ProgressionHolder.Action.SellAll(job.id()));
        }

        inventory.setItem(50, MenuItems.of(Material.BARRIER,
                messages.text("progression.gui.jobs.resign"),
                messages.lines("progression.gui.jobs.resign-warning").stream()
                        .map(component -> net.kyori.adventure.text.serializer.plain
                                .PlainTextComponentSerializer.plainText().serialize(component))
                        .map(line -> "&c" + line)
                        .toList()));

        holder.bind(50, new ProgressionHolder.Action.ResignJob(job.id()));

        // The player's workspace for this job, if they have one. Clicking opens it, so the job page
        // is the route to the business rather than a separate command nobody would discover.
        workspaces.ownedBy(playerId, job.id()).ifPresent(workspace -> {
            inventory.setItem(13, MenuItems.of(Material.OAK_DOOR,
                    messages.text("progression.gui.jobs.workspace"),
                    List.of(
                            messages.text("progression.gui.jobs.workspace-at",
                                    "where", workspace.region().describe()),
                            messages.text("progression.gui.jobs.workspace-hint"))));

            holder.bind(13, new ProgressionHolder.Action.OpenWorkspace(workspace.id()));
        });

        inventory.setItem(45, MenuItems.back(messages.text("progression.gui.back")));
        holder.bind(45, new ProgressionHolder.Action.Back(ProgressionHolder.View.JOBS));
    }
}
