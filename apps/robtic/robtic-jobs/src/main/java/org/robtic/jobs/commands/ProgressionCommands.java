package org.robtic.jobs.commands;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.config.MessageCatalog;
import org.robtic.jobs.events.PlayerGainJobEvent;
import org.robtic.jobs.events.PlayerLoseJobEvent;
import org.robtic.jobs.gui.JobMenu;
import org.robtic.jobs.gui.TitleMenu;
import org.robtic.jobs.jobs.Job;
import org.robtic.jobs.jobs.JobLimits;
import org.robtic.jobs.jobs.JobProgress;
import org.robtic.jobs.jobs.JobService;
import org.robtic.jobs.storage.ProgressionRepository;
import org.robtic.jobs.workspace.WorkspaceService;
import org.robtic.core.titles.Title;
import org.robtic.core.titles.TitleService;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * {@code /jobs}, {@code /titles} and the admin subcommands.
 *
 * <h2>Player commands are thin</h2>
 *
 * Both open a menu, because the menus are where the system is actually used. The commands exist for
 * the players who prefer typing and for the ones whose muscle memory expects {@code /jobs} to do
 * something.
 *
 * <h2>Admin commands are not shortcuts around the rules</h2>
 *
 * {@code /jobs admin give} runs the same {@link JobService#claim} chain as an NPC, so it respects
 * limits, fires the same events and cannot produce a state the normal path could not. The only thing
 * it skips is having to walk to a structure. An admin path that bypassed validation would be the
 * fastest way to create the duplicate-ownership bugs the validation exists to prevent.
 */
public final class ProgressionCommands implements CommandExecutor, TabCompleter {

    private static final String ADMIN = "robtic.jobs.admin";

    private final JobService jobs;
    private final TitleService titles;
    private final JobMenu jobMenu;
    private final TitleMenu titleMenu;
    private final MessageCatalog messages;
    private final Runnable reload;

    /** Both read-only here, and only by {@code /jobs debug} — see {@link #debug}. */
    private final WorkspaceService workspaces;
    private final ProgressionRepository repository;

    public ProgressionCommands(
            JobService jobs,
            TitleService titles,
            JobMenu jobMenu,
            TitleMenu titleMenu,
            WorkspaceService workspaces,
            ProgressionRepository repository,
            MessageCatalog messages,
            Runnable reload
    ) {
        this.jobs = jobs;
        this.titles = titles;
        this.jobMenu = jobMenu;
        this.titleMenu = titleMenu;
        this.workspaces = workspaces;
        this.repository = repository;
        this.messages = messages;
        this.reload = reload;
    }

    @Override
    public boolean onCommand(
            @NotNull CommandSender sender,
            @NotNull Command command,
            @NotNull String label,
            @NotNull String[] args
    ) {
        boolean isTitles = command.getName().equalsIgnoreCase("titles");

        if (args.length > 0 && args[0].equalsIgnoreCase("admin")) {
            return admin(sender, args);
        }

        if (!(sender instanceof Player player)) {
            sender.sendMessage(messages.prefixed("progression.player-only"));
            return true;
        }

        if (isTitles) {
            return titlesCommand(player, args);
        }

        return jobsCommand(player, args);
    }

    private boolean titlesCommand(Player player, String[] args) {
        if (args.length == 0) {
            titleMenu.open(player);
            return true;
        }

        return switch (args[0].toLowerCase(Locale.ROOT)) {
            case "equip", "set" -> {
                if (args.length < 2) {
                    player.sendMessage(messages.prefixed("progression.titles.usage-equip"));
                    yield true;
                }

                Optional<TitleService.Refusal> refusal = titles.equip(player.getUniqueId(), args[1]);

                player.sendMessage(refusal.isPresent()
                        ? messages.prefixed("progression.titles.cannot-equip")
                        : messages.prefixed("progression.titles.equipped", "title", args[1]));

                yield true;
            }
            case "unequip", "clear", "off" -> {
                titles.unequip(player.getUniqueId());
                player.sendMessage(messages.prefixed("progression.titles.unequipped"));
                yield true;
            }
            case "list" -> {
                List<Title> owned = titles.ownedTitles(player.getUniqueId());

                if (owned.isEmpty()) {
                    player.sendMessage(messages.prefixed("progression.titles.none"));
                    yield true;
                }

                player.sendMessage(messages.prefixed("progression.titles.list-header",
                        "count", String.valueOf(owned.size())));

                owned.forEach(title -> player.sendMessage(messages.component(
                        "progression.titles.list-entry",
                        "id", title.id(),
                        "title", title.display(),
                        "rarity", title.rarity().display())));

                yield true;
            }
            default -> {
                titleMenu.open(player);
                yield true;
            }
        };
    }

    private boolean jobsCommand(Player player, String[] args) {
        if (args.length == 0) {
            jobMenu.open(player);
            return true;
        }

        return switch (args[0].toLowerCase(Locale.ROOT)) {
            case "info" -> {
                if (args.length < 2) {
                    jobMenu.open(player);
                    yield true;
                }

                jobs.catalog().job(args[1]).ifPresentOrElse(
                        job -> jobMenu.openDetail(player, job.id()),
                        () -> player.sendMessage(messages.prefixed("progression.jobs.unknown",
                                "job", args[1])));

                yield true;
            }
            case "leave", "resign", "quit" -> {
                if (args.length < 2) {
                    player.sendMessage(messages.prefixed("progression.jobs.usage-leave"));
                    yield true;
                }

                boolean left = jobs.resign(player.getUniqueId(), args[1],
                        PlayerLoseJobEvent.Reason.RESIGNED);

                player.sendMessage(left
                        ? messages.prefixed("progression.jobs.resigned", "job", args[1])
                        : messages.prefixed("progression.jobs.not-owned"));

                yield true;
            }
            case "stats", "stat" -> {
                stats(player, args.length > 1 ? Optional.of(args[1]) : Optional.empty());
                yield true;
            }
            case "debug" -> {
                debug(player);
                yield true;
            }
            case "activate", "use" -> {
                if (args.length < 2) {
                    player.sendMessage(messages.prefixed("progression.jobs.usage-activate"));
                    yield true;
                }

                JobService.SwitchResult result = jobs.activate(player.getUniqueId(), args[1],
                        args.length > 2 ? Optional.of(args[2]) : Optional.empty());

                player.sendMessage(messages.prefixed(result == JobService.SwitchResult.SUCCESS
                        ? "progression.jobs.activated"
                        : "progression.jobs.active-limit"));

                yield true;
            }
            default -> {
                jobMenu.open(player);
                yield true;
            }
        };
    }

    /**
     * {@code /jobs stats [job]} — what a profession has recorded.
     *
     * <h2>Read from the job's own counters, not from the statistics service</h2>
     *
     * These are the per-action tallies {@code JobProgress} keeps — stone broken, ore smelted, items
     * sold — which exist because a job needs to know what was done *in that job*. The server-wide
     * statistics service answers a different question ("how much has this player ever mined") and is
     * shown by whatever displays statistics. Mirroring one into the other is exactly the duplicate
     * counter the design forbids, so this reads the job's and says so.
     */
    private void stats(Player player, Optional<String> jobId) {
        UUID playerId = player.getUniqueId();

        List<Job> showing = jobId
                .map(id -> jobs.catalog().job(id).map(List::of).orElse(List.<Job>of()))
                .orElseGet(() -> jobs.ownedJobs(playerId));

        if (showing.isEmpty()) {
            player.sendMessage(messages.prefixed(jobId.isPresent()
                    ? "progression.jobs.unknown"
                    : "progression.jobs.none-owned", "job", jobId.orElse("")));
            return;
        }

        for (Job job : showing) {
            Optional<JobProgress> progress = jobs.progress(playerId, job.id());

            if (progress.isEmpty()) {
                player.sendMessage(messages.prefixed("progression.jobs.not-owned"));
                continue;
            }

            JobProgress current = progress.get();

            player.sendMessage(messages.prefixed("progression.jobs.stats-header",
                    "job", job.display(),
                    "level", String.valueOf(current.level(job.curve())),
                    "max", String.valueOf(job.maxLevel()),
                    "xp", String.valueOf(current.totalXp()),
                    "next", String.valueOf(job.curve().xpToNextLevel(current.totalXp()))));

            // Ordered and capped. An established player accumulates a counter per block type they
            // have ever broken, and dumping two hundred lines into chat is not a report.
            current.statistics().keys().stream()
                    .sorted(java.util.Comparator
                            .comparingLong((String key) -> current.statistics().get(key)).reversed())
                    .limit(STATS_LINES)
                    .forEach(key -> player.sendMessage(messages.component("progression.jobs.stats-entry",
                            "action", key,
                            "count", String.valueOf(current.statistics().get(key)))));
        }
    }

    /** How many per-action counters {@code /jobs stats} prints per job. */
    private static final int STATS_LINES = 10;

    /**
     * {@code /jobs debug} — why the system is not doing what the player expects.
     *
     * Aimed at the two questions that actually get asked: "why am I not gaining XP" and "why can I
     * not claim anything". So it reports whether progression loaded at all, which jobs are active
     * rather than merely owned — inactive jobs earn nothing, and that is the single commonest
     * misunderstanding — and where the limits currently sit.
     */
    private void debug(Player player) {
        UUID playerId = player.getUniqueId();

        player.sendMessage(messages.prefixed("progression.jobs.debug-header",
                "backend", repository.backend(),
                "loaded", String.valueOf(repository.isLoaded(playerId))));

        JobLimits.Limit limit = jobs.limits().forPlayer(playerId);

        player.sendMessage(messages.component("progression.jobs.debug-limits",
                "owned", String.valueOf(jobs.jobsOf(playerId).ownedCount()),
                "owned-limit", String.valueOf(limit.owned()),
                "active", String.valueOf(jobs.jobsOf(playerId).activeCount()),
                "active-limit", String.valueOf(limit.active())));

        for (Job job : jobs.ownedJobs(playerId)) {
            player.sendMessage(messages.component("progression.jobs.debug-job",
                    "job", job.id(),
                    "level", String.valueOf(jobs.levelOf(playerId, job.id())),
                    "active", String.valueOf(jobs.jobsOf(playerId).isActive(job.id())),
                    "workspace", workspaces.ownedBy(playerId, job.id())
                            .map(workspace -> workspace.region().describe())
                            .orElse("-")));
        }

        player.sendMessage(messages.component("progression.jobs.debug-workspaces",
                "count", String.valueOf(workspaces.ownedBy(playerId).size()),
                "limit", String.valueOf(workspaces.limitFor(playerId))));
    }

    /**
     * Admin subcommands.
     *
     * Every one of them names the player explicitly rather than acting on the sender, so they can be
     * run from console — which is what a web panel or an automated reward will be using.
     */
    private boolean admin(CommandSender sender, String[] args) {
        if (!sender.hasPermission(ADMIN)) {
            sender.sendMessage(messages.prefixed("progression.no-permission"));
            return true;
        }

        if (args.length < 2) {
            messages.lines("progression.admin.usage").forEach(sender::sendMessage);
            return true;
        }

        return switch (args[1].toLowerCase(Locale.ROOT)) {
            case "reload" -> {
                reload.run();
                sender.sendMessage(messages.prefixed("progression.admin.reloaded"));
                yield true;
            }
            case "give" -> adminGiveJob(sender, args);
            case "take" -> adminTakeJob(sender, args);
            case "grant" -> adminGrantTitle(sender, args);
            case "revoke" -> adminRevokeTitle(sender, args);
            case "info" -> adminInfo(sender, args);
            default -> {
                messages.lines("progression.admin.usage").forEach(sender::sendMessage);
                yield true;
            }
        };
    }

    private boolean adminGiveJob(CommandSender sender, String[] args) {
        if (args.length < 4) {
            sender.sendMessage(messages.prefixed("progression.admin.usage-give"));
            return true;
        }

        Player target = sender.getServer().getPlayerExact(args[2]);

        if (target == null) {
            sender.sendMessage(messages.prefixed("progression.admin.player-offline", "player", args[2]));
            return true;
        }

        // The same validation chain the NPC uses, deliberately — see the class comment.
        JobService.ClaimResult result =
                jobs.claim(target, args[3], PlayerGainJobEvent.Source.ADMIN);

        sender.sendMessage(messages.prefixed("progression.admin.give-result",
                "player", target.getName(),
                "job", args[3],
                "result", result.name().toLowerCase(Locale.ROOT).replace('_', ' ')));

        return true;
    }

    private boolean adminTakeJob(CommandSender sender, String[] args) {
        if (args.length < 4) {
            sender.sendMessage(messages.prefixed("progression.admin.usage-take"));
            return true;
        }

        Optional<UUID> target = resolve(sender, args[2]);

        if (target.isEmpty()) {
            sender.sendMessage(messages.prefixed("progression.admin.player-offline", "player", args[2]));
            return true;
        }

        boolean removed = jobs.resign(target.get(), args[3], PlayerLoseJobEvent.Reason.ADMIN);

        sender.sendMessage(messages.prefixed(removed
                        ? "progression.admin.took-job"
                        : "progression.jobs.not-owned",
                "player", args[2], "job", args[3]));

        return true;
    }

    private boolean adminGrantTitle(CommandSender sender, String[] args) {
        if (args.length < 4) {
            sender.sendMessage(messages.prefixed("progression.admin.usage-grant"));
            return true;
        }

        Optional<UUID> target = resolve(sender, args[2]);

        if (target.isEmpty()) {
            sender.sendMessage(messages.prefixed("progression.admin.player-offline", "player", args[2]));
            return true;
        }

        boolean granted = titles.unlock(target.get(), args[3], "admin:" + sender.getName());

        sender.sendMessage(messages.prefixed(granted
                        ? "progression.admin.granted-title"
                        : "progression.admin.already-owned",
                "player", args[2], "title", args[3]));

        return true;
    }

    private boolean adminRevokeTitle(CommandSender sender, String[] args) {
        if (args.length < 4) {
            sender.sendMessage(messages.prefixed("progression.admin.usage-revoke"));
            return true;
        }

        Optional<UUID> target = resolve(sender, args[2]);

        if (target.isEmpty()) {
            sender.sendMessage(messages.prefixed("progression.admin.player-offline", "player", args[2]));
            return true;
        }

        boolean revoked = titles.revoke(target.get(), args[3]);

        sender.sendMessage(messages.prefixed(revoked
                        ? "progression.admin.revoked-title"
                        : "progression.admin.not-owned",
                "player", args[2], "title", args[3]));

        return true;
    }

    private boolean adminInfo(CommandSender sender, String[] args) {
        if (args.length < 3) {
            sender.sendMessage(messages.prefixed("progression.admin.usage-info"));
            return true;
        }

        Optional<UUID> target = resolve(sender, args[2]);

        if (target.isEmpty()) {
            sender.sendMessage(messages.prefixed("progression.admin.player-offline", "player", args[2]));
            return true;
        }

        UUID playerId = target.get();

        sender.sendMessage(messages.prefixed("progression.admin.info-header", "player", args[2]));

        for (Job job : jobs.ownedJobs(playerId)) {
            sender.sendMessage(messages.component("progression.admin.info-job",
                    "job", job.id(),
                    "level", String.valueOf(jobs.levelOf(playerId, job.id())),
                    "active", String.valueOf(jobs.jobsOf(playerId).isActive(job.id()))));
        }

        sender.sendMessage(messages.component("progression.admin.info-titles",
                "count", String.valueOf(titles.titlesOf(playerId).owned().size()),
                "equipped", titles.equipped(playerId).map(Title::id).orElse("-")));

        return true;
    }

    /**
     * Resolves a name to a uuid, online players only.
     *
     * Offline resolution would need a blocking lookup on the command thread, and the operations here
     * all need loaded progression anyway — the repository refuses to write for a player it has not
     * loaded, so acting on an offline account would silently do nothing.
     */
    private Optional<UUID> resolve(CommandSender sender, String name) {
        Player online = sender.getServer().getPlayerExact(name);
        return online == null ? Optional.empty() : Optional.of(online.getUniqueId());
    }

    @Override
    public List<String> onTabComplete(
            @NotNull CommandSender sender,
            @NotNull Command command,
            @NotNull String label,
            @NotNull String[] args
    ) {
        boolean isTitles = command.getName().equalsIgnoreCase("titles");
        List<String> options = new ArrayList<>();

        if (args.length == 1) {
            options.addAll(isTitles
                    ? List.of("equip", "unequip", "list")
                    : List.of("info", "leave", "activate", "stats", "debug"));

            if (sender.hasPermission(ADMIN)) {
                options.add("admin");
            }
        } else if (args.length == 2 && args[0].equalsIgnoreCase("admin")) {
            options.addAll(List.of("reload", "give", "take", "grant", "revoke", "info"));
        } else if (args.length == 2) {
            options.addAll(isTitles
                    ? titlesFor(sender)
                    : jobs.catalog().jobs().ids());
        } else if (args.length == 3 && args[0].equalsIgnoreCase("admin")) {
            sender.getServer().getOnlinePlayers().forEach(player -> options.add(player.getName()));
        } else if (args.length == 4 && args[0].equalsIgnoreCase("admin")) {
            options.addAll(args[1].equalsIgnoreCase("grant") || args[1].equalsIgnoreCase("revoke")
                    ? titles.catalog().titles().ids()
                    : jobs.catalog().jobs().ids());
        }

        String prefix = args.length == 0 ? "" : args[args.length - 1].toLowerCase(Locale.ROOT);

        return options.stream()
                .filter(option -> option.toLowerCase(Locale.ROOT).startsWith(prefix))
                .sorted()
                .toList();
    }

    /** Completes only the titles the sender actually owns, so the list is useful rather than huge. */
    private List<String> titlesFor(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            return List.copyOf(titles.catalog().titles().ids());
        }

        return titles.ownedTitles(player.getUniqueId()).stream().map(Title::id).toList();
    }
}
