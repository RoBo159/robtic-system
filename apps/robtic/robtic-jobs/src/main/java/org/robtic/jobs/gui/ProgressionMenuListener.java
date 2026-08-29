package org.robtic.jobs.gui;

import org.robtic.core.gui.MenuItems;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;
import org.robtic.core.config.MessageCatalog;
import org.robtic.jobs.events.PlayerLoseJobEvent;
import org.robtic.jobs.jobs.Job;
import org.robtic.jobs.jobs.JobService;
import org.robtic.jobs.market.SellService;
import org.robtic.core.titles.Title;
import org.robtic.core.titles.TitleService;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Runs every click in the progression menus.
 *
 * <h2>One listener, dispatching on bound actions</h2>
 *
 * The alternative — a listener per menu — means four places that each have to remember to cancel the
 * event, verify the holder and re-render. Dispatching on {@link ProgressionHolder.Action} keeps
 * those in one place and means adding a button is a new record and one case.
 *
 * <h2>Everything is cancelled</h2>
 *
 * Clicks are cancelled before anything else happens, including clicks on empty slots and clicks in
 * the player's own inventory while a menu is open. A menu that lets an item be dragged into it is a
 * menu that eats items, and shift-clicking from the lower inventory is the usual way that is
 * discovered.
 */
public final class ProgressionMenuListener implements Listener {

    private final Plugin plugin;
    private final TitleService titles;
    private final JobService jobs;
    private final SellService sell;
    private final TitleMenu titleMenu;
    private final JobMenu jobMenu;
    private final MessageCatalog messages;

    /**
     * Workspace clicks are delegated rather than handled here.
     *
     * The workspace has its own screens, its own validation and its own storage rules; folding them
     * into this switch would make one class responsible for three menus and their logic. This
     * listener stays the single place clicks are *cancelled and dispatched*, which is what actually
     * has to be uniform.
     */
    private final org.robtic.jobs.workspace.WorkspaceController workspaces;

    /** Players who clicked search and are expected to type a term next. */
    private final Map<UUID, Long> awaitingSearch = new ConcurrentHashMap<>();

    /** Players who clicked resign, and the job they clicked it on. Cleared once confirmed. */
    private final Map<UUID, String> awaitingResign = new ConcurrentHashMap<>();

    /** How long a search prompt or a resign confirmation stays valid. */
    private static final long PROMPT_TIMEOUT_MILLIS = 30_000L;

    public ProgressionMenuListener(
            Plugin plugin,
            TitleService titles,
            JobService jobs,
            SellService sell,
            TitleMenu titleMenu,
            JobMenu jobMenu,
            org.robtic.jobs.workspace.WorkspaceController workspaces,
            MessageCatalog messages
    ) {
        this.plugin = plugin;
        this.titles = titles;
        this.jobs = jobs;
        this.sell = sell;
        this.titleMenu = titleMenu;
        this.jobMenu = jobMenu;
        this.workspaces = workspaces;
        this.messages = messages;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onClick(InventoryClickEvent event) {
        if (!(event.getInventory().getHolder() instanceof ProgressionHolder holder)) {
            return;
        }

        // Cancelled unconditionally, before any dispatch. Covers clicks on decoration, on empty
        // slots, and shift-clicks originating in the player's own inventory.
        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        // A click in the lower inventory has a raw slot outside the menu and no bound action, so it
        // is already handled by the cancel above.
        holder.actionAt(event.getRawSlot()).ifPresent(action -> {
            // Workspace actions first: the controller reports whether it recognised one, so this
            // switch never has to enumerate them.
            if (workspaces.handle(player, action, event.isShiftClick())) {
                return;
            }

            dispatch(player, holder, action);
        });
    }

    /** Dragging across menu slots is another way to move items into one. */
    @EventHandler(priority = EventPriority.HIGH)
    public void onDrag(InventoryDragEvent event) {
        if (event.getInventory().getHolder() instanceof ProgressionHolder) {
            event.setCancelled(true);
        }
    }

    private void dispatch(Player player, ProgressionHolder holder, ProgressionHolder.Action action) {
        UUID playerId = player.getUniqueId();

        switch (action) {
            case ProgressionHolder.Action.EquipTitle equip -> equip(player, equip.titleId());

            case ProgressionHolder.Action.LockedTitle locked -> {
                // Clicking a locked title says why. Doing nothing would read as a broken button.
                titles.catalog().title(locked.titleId()).ifPresent(title ->
                        player.sendMessage(messages.prefixed("progression.titles.locked",
                                "title", MenuItems.plain(title.display()),
                                "requirement", title.unlock().describe())));

                player.playSound(player.getLocation(), Sound.BLOCK_NOTE_BLOCK_BASS, 0.6f, 0.8f);
            }

            case ProgressionHolder.Action.Unequip ignored -> {
                if (titles.unequip(playerId)) {
                    player.sendMessage(messages.prefixed("progression.titles.unequipped"));
                }
                titleMenu.open(player);
            }

            case ProgressionHolder.Action.Sort sort -> {
                TitleMenuState.set(playerId, TitleMenuState.of(playerId).withSort(sort.sort()));
                titleMenu.open(player);
            }

            case ProgressionHolder.Action.FilterRarity filter -> {
                TitleMenuState.set(playerId, TitleMenuState.of(playerId).withRarity(filter.rarityId()));
                titleMenu.open(player);
            }

            case ProgressionHolder.Action.FilterSource filter -> {
                TitleMenuState.set(playerId, TitleMenuState.of(playerId).withSource(filter.sourceId()));
                titleMenu.open(player);
            }

            case ProgressionHolder.Action.ToggleLocked toggle -> {
                TitleMenuState.set(playerId, TitleMenuState.of(playerId).withShowLocked(toggle.show()));
                titleMenu.open(player);
            }

            case ProgressionHolder.Action.ClearFilters ignored -> {
                TitleMenuState.set(playerId, TitleMenuState.of(playerId).cleared());
                titleMenu.open(player);
            }

            case ProgressionHolder.Action.Page page -> {
                TitleMenuState.set(playerId, TitleMenuState.of(playerId).withPage(page.page()));
                titleMenu.open(player);
            }

            case ProgressionHolder.Action.Search ignored -> promptSearch(player);

            case ProgressionHolder.Action.OpenJob open -> jobMenu.openDetail(player, open.jobId());

            case ProgressionHolder.Action.ActivateJob activate -> activate(player, activate.jobId());

            case ProgressionHolder.Action.DeactivateJob deactivate -> {
                if (jobs.deactivate(playerId, deactivate.jobId())) {
                    player.sendMessage(messages.prefixed("progression.jobs.deactivated"));
                }
                jobMenu.openDetail(player, deactivate.jobId());
            }

            case ProgressionHolder.Action.ResignJob resign -> resign(player, resign.jobId());

            case ProgressionHolder.Action.SellAll sellAll ->
                    jobs.catalog().job(sellAll.jobId()).ifPresent(job -> sell(player, job));

            case ProgressionHolder.Action.Back back -> back(player, back.target());

            case ProgressionHolder.Action.Close ignored -> player.closeInventory();

            // The workspace actions, which the controller has already handled — onClick offers every
            // action to it first and only reaches here if it declined. Listed as a default rather
            // than enumerated so a new workspace action needs no edit in this file.
            default -> {
            }
        }
    }

    private void equip(Player player, String titleId) {
        Optional<TitleService.Refusal> refusal = titles.equip(player.getUniqueId(), titleId);

        if (refusal.isPresent()) {
            player.sendMessage(messages.prefixed("progression.titles.cannot-equip"));
            player.playSound(player.getLocation(), Sound.BLOCK_NOTE_BLOCK_BASS, 0.6f, 0.8f);
        } else {
            titles.catalog().title(titleId).ifPresent(title ->
                    player.sendMessage(messages.prefixed("progression.titles.equipped",
                            "title", MenuItems.plain(title.display()))));

            player.playSound(player.getLocation(), Sound.UI_BUTTON_CLICK, 0.7f, 1.4f);
        }

        titleMenu.open(player);
    }

    /**
     * Activates a job, replacing the first active one when the player is at their limit.
     *
     * Auto-replacing rather than refusing is the friendlier default and is safe precisely because
     * deactivation loses nothing — see {@code PlayerSwitchJobEvent}. A player who wanted to keep a
     * different one active can switch back at no cost.
     */
    private void activate(Player player, String jobId) {
        UUID playerId = player.getUniqueId();

        Optional<String> replacing = jobs.limits().mayActivateAnother(playerId, jobs.jobsOf(playerId))
                ? Optional.empty()
                : jobs.jobsOf(playerId).active().stream().findFirst();

        JobService.SwitchResult result = jobs.activate(playerId, jobId, replacing);

        player.sendMessage(messages.prefixed(switch (result) {
            case SUCCESS -> "progression.jobs.activated";
            case ACTIVE_LIMIT_REACHED -> "progression.jobs.active-limit";
            case ALREADY_ACTIVE -> "progression.jobs.already-active";
            case NOT_OWNED -> "progression.jobs.not-owned";
            case NOT_LOADED -> "progression.not-loaded";
            case UNKNOWN_JOB -> "progression.jobs.unknown";
            case CANCELLED -> "progression.jobs.cancelled";
        }));

        jobMenu.openDetail(player, jobId);
    }

    /**
     * Resignation, behind a confirmation.
     *
     * Two clicks rather than one, because this is the only irreversible action in the whole system —
     * a player who misclicks loses every level and title in that job with no way back. The
     * confirmation expires, so a stale one cannot be triggered by a click half an hour later.
     */
    private void resign(Player player, String jobId) {
        UUID playerId = player.getUniqueId();
        String pending = awaitingResign.get(playerId);

        if (!jobId.equals(pending)) {
            awaitingResign.put(playerId, jobId);

            jobs.catalog().job(jobId).ifPresent(job ->
                    player.sendMessage(messages.prefixed("progression.jobs.resign-confirm",
                            "job", job.display())));

            plugin.getServer().getScheduler().runTaskLater(plugin,
                    () -> awaitingResign.remove(playerId, jobId),
                    PROMPT_TIMEOUT_MILLIS / 50L);

            return;
        }

        awaitingResign.remove(playerId);

        if (jobs.resign(playerId, jobId, PlayerLoseJobEvent.Reason.RESIGNED)) {
            jobs.catalog().job(jobId).ifPresent(job ->
                    player.sendMessage(messages.prefixed("progression.jobs.resigned",
                            "job", job.display())));
        }

        jobMenu.open(player);
    }

    private void sell(Player player, Job job) {
        player.closeInventory();

        sell.sellAll(player, job, result -> {
            switch (result) {
                case SellService.Result.Sold sold -> {
                    player.sendMessage(messages.prefixed("progression.sell.sold",
                            "amount", String.valueOf(sold.amount()),
                            "paid", MenuItems.robs(sold.paid())));
                    player.playSound(player.getLocation(), Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 0.8f, 1.2f);
                }
                case SellService.Result.NothingToSell ignored ->
                        player.sendMessage(messages.prefixed("progression.sell.nothing"));
                case SellService.Result.Refused refused ->
                        player.sendMessage(messages.prefixed("progression.sell.refused",
                                "reason", refused.because()));
                case SellService.Result.QuotaReached quota ->
                        player.sendMessage(messages.prefixed("progression.sell.quota",
                                "quota", String.valueOf(quota.quota())));
                case SellService.Result.OnCooldown cooldown ->
                        player.sendMessage(messages.prefixed("progression.sell.cooldown",
                                "seconds", String.valueOf(Math.max(1, cooldown.millisRemaining() / 1000))));
                case SellService.Result.PaymentFailed ignored ->
                        player.sendMessage(messages.prefixed("progression.sell.failed"));
            }
        });
    }

    private void back(Player player, ProgressionHolder.View target) {
        switch (target) {
            case TITLES -> titleMenu.open(player);
            case JOBS -> jobMenu.open(player);
            case FILTER_RARITY -> player.openInventory(titleMenu.buildRarityFilter(player));
            case FILTER_SOURCE -> player.openInventory(titleMenu.buildSourceFilter(player));
            default -> player.closeInventory();
        }
    }

    /**
     * Asks for a search term in chat.
     *
     * Chat rather than an anvil GUI. An anvil is prettier and is also a second inventory that has to
     * be opened, closed and cleaned up, and it does not work on Bedrock clients — for a text prompt,
     * chat is the option that works everywhere.
     */
    private void promptSearch(Player player) {
        player.closeInventory();
        awaitingSearch.put(player.getUniqueId(), System.currentTimeMillis());

        player.sendMessage(messages.prefixed("progression.titles.search-prompt"));
    }

    /**
     * Captures a search term typed in chat.
     *
     * Deprecated event, used deliberately: it is the one chat event that fires on every server
     * regardless of which chat plugin is installed, and a search prompt that silently fails on a
     * server with a chat plugin would be worse than the deprecation warning.
     *
     * Fires asynchronously, so the menu is reopened on the main thread.
     */
    @SuppressWarnings("deprecation")
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        UUID playerId = event.getPlayer().getUniqueId();
        Long since = awaitingSearch.remove(playerId);

        if (since == null) {
            return;
        }

        if (System.currentTimeMillis() - since > PROMPT_TIMEOUT_MILLIS) {
            // Expired. The message goes to chat as the player intended rather than vanishing into a
            // prompt they had forgotten about.
            return;
        }

        event.setCancelled(true);

        String term = event.getMessage().trim();
        String search = term.equalsIgnoreCase("cancel") ? "" : term;

        plugin.getServer().getScheduler().runTask(plugin, () -> {
            TitleMenuState.set(playerId, TitleMenuState.of(playerId).withSearch(search));
            titleMenu.open(event.getPlayer());
        });
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        UUID playerId = event.getPlayer().getUniqueId();

        awaitingSearch.remove(playerId);
        awaitingResign.remove(playerId);
        TitleMenuState.forget(playerId);
    }
}
