package org.robtic.jobs.market;

import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;
import org.robtic.core.unlock.Attributes;
import org.robtic.jobs.events.PlayerSellItemsEvent;
import org.robtic.jobs.jobs.Job;
import org.robtic.jobs.jobs.JobAction;
import org.robtic.jobs.jobs.JobService;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Selling a job's output to the server.
 *
 * <h2>Items are taken, then payment is attempted, then items are returned if it failed</h2>
 *
 * The ordering deserves stating because the alternatives are both broken. Paying first and then
 * removing items lets a player drop the stack in the window between and be paid for nothing. Taking
 * and paying "atomically" is not available — the payment crosses a network to the Robtic API and can
 * fail after the request has left.
 *
 * So items are removed on the tick, the payment is attempted on a worker, and a failure gives every
 * item back on the tick. The failure path is the important one: it must never leave a player having
 * lost items without being paid, which is the version of this bug players notice and remember.
 *
 * <h2>Selling awards XP</h2>
 *
 * Through the same {@link JobAction} pipeline as everything else — {@code sell:DIAMOND}. A job can
 * therefore reward selling, or not, entirely in config, and nothing here decides that.
 */
public final class SellService {

    /** The outcome of an attempted sale. */
    public sealed interface Result {

        /** Sold, and this is what it paid. */
        record Sold(int amount, double paid) implements Result {
        }

        /** Nothing in the inventory this job buys. */
        record NothingToSell() implements Result {
        }

        /** A configured requirement is not met. */
        record Refused(String because) implements Result {
        }

        /** Their daily quota is used up. */
        record QuotaReached(int quota) implements Result {
        }

        /** They sold too recently. */
        record OnCooldown(long millisRemaining) implements Result {
        }

        /** The payment failed; the items have been returned. */
        record PaymentFailed() implements Result {
        }
    }

    private final Plugin plugin;
    private final JobService jobs;
    private final Attributes attributes;
    private final SellQuotas quotas;

    private volatile JobEconomy economy = JobEconomy.NONE;
    private volatile Map<String, SellConditions> conditions = Map.of();

    public SellService(Plugin plugin, JobService jobs, Attributes attributes, SellQuotas quotas) {
        this.plugin = plugin;
        this.jobs = jobs;
        this.attributes = attributes;
        this.quotas = quotas;
    }

    public void economy(JobEconomy economy) {
        this.economy = economy == null ? JobEconomy.NONE : economy;
    }

    public JobEconomy economy() {
        return economy;
    }

    /** Replaces the per-job sell conditions after a reload. */
    public void conditions(Map<String, SellConditions> conditions) {
        this.conditions = Map.copyOf(conditions);
    }

    public SellConditions conditionsFor(String jobId) {
        return conditions.getOrDefault(jobId, SellConditions.NONE);
    }

    public SellQuotas quotas() {
        return quotas;
    }

    /**
     * Sells everything in the player's inventory that this job buys.
     *
     * @param whenDone called on the main thread with the outcome
     */
    public void sellAll(Player player, Job job, Consumer<Result> whenDone) {
        UUID playerId = player.getUniqueId();

        if (!economy.available()) {
            whenDone.accept(new Result.Refused("The economy is unavailable."));
            return;
        }

        SellConditions requirements = conditionsFor(job.id());

        if (!requirements.satisfied(playerId, Optional.of(player), attributes)) {
            whenDone.accept(new Result.Refused(requirements.describe()));
            return;
        }

        long cooldown = quotas.cooldownRemaining(playerId, job.id(), requirements.cooldownMillis());

        if (cooldown > 0L) {
            whenDone.accept(new Result.OnCooldown(cooldown));
            return;
        }

        Map<SellPrice, Integer> sellable = countSellable(player, job);

        if (sellable.isEmpty()) {
            whenDone.accept(new Result.NothingToSell());
            return;
        }

        int total = sellable.values().stream().mapToInt(Integer::intValue).sum();
        int allowed = quotas.allowance(playerId, job.id(), total, requirements.dailyQuota());

        if (allowed <= 0) {
            whenDone.accept(new Result.QuotaReached(requirements.dailyQuota()));
            return;
        }

        // Trimmed to the quota before anything is removed, so the player is never left holding an
        // item that was taken and then found to be over the limit.
        Map<SellPrice, Integer> selling = allowed < total ? trim(sellable, allowed) : sellable;

        Map<SellPrice, Integer> removed = remove(player, selling);
        int soldCount = removed.values().stream().mapToInt(Integer::intValue).sum();

        if (soldCount <= 0) {
            whenDone.accept(new Result.NothingToSell());
            return;
        }

        // Rounded once, at the end. Rounding each line would lose up to half a hundredth per
        // item type on every sale — invisible individually and a systematic under-payment once a
        // player has sold a few thousand stacks.
        double payment = org.robtic.core.util.Robs.round(removed.entrySet().stream()
                .mapToDouble(entry -> entry.getKey().serverTotal(entry.getValue()))
                .sum());

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            boolean paid = economy.pay(playerId, player.getName(), payment, "job-sell:" + job.id());

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                if (!paid) {
                    // Everything goes back. A player who lost items and was not paid is the one
                    // failure of this system that would be unforgivable.
                    refund(player, removed);
                    whenDone.accept(new Result.PaymentFailed());
                    return;
                }

                quotas.record(playerId, job.id(), soldCount);

                // XP for selling, through the ordinary action pipeline — a job that does not reward
                // "sell:" in its config simply earns nothing here.
                removed.forEach((price, amount) -> {
                    for (int index = 0; index < amount; index++) {
                        jobs.award(player, JobAction.of("sell", price.itemKey()));
                    }
                });

                // Announced last, once the items, the money, the quota and the XP have all settled.
                // A listener reading any of those during the event therefore sees the finished state
                // rather than a sale halfway through being applied.
                plugin.getServer().getPluginManager().callEvent(
                        new PlayerSellItemsEvent(playerId, job, lineItems(removed), payment));

                whenDone.accept(new Result.Sold(soldCount, payment));
            });
        });
    }

    /** The removed map keyed by item id rather than by price, which is what listeners can use. */
    private static Map<String, Integer> lineItems(Map<SellPrice, Integer> removed) {
        Map<String, Integer> lines = new LinkedHashMap<>();

        removed.forEach((price, amount) -> lines.merge(price.itemKey(), amount, Integer::sum));

        return lines;
    }

    /** What the player is carrying that this job buys, and how much of each. */
    private Map<SellPrice, Integer> countSellable(Player player, Job job) {
        Map<SellPrice, Integer> counts = new LinkedHashMap<>();

        for (ItemStack stack : player.getInventory().getStorageContents()) {
            if (stack == null || stack.getType().isAir()) {
                continue;
            }

            job.priceOf(stack.getType().name())
                    .ifPresent(price -> counts.merge(price, stack.getAmount(), Integer::sum));
        }

        return counts;
    }

    /** Reduces a sale to fit a quota, filling from the most valuable item down. */
    private Map<SellPrice, Integer> trim(Map<SellPrice, Integer> sellable, int allowed) {
        Map<SellPrice, Integer> trimmed = new LinkedHashMap<>();
        int remaining = allowed;

        for (Map.Entry<SellPrice, Integer> entry : sellable.entrySet().stream()
                .sorted((a, b) -> Double.compare(b.getKey().server(), a.getKey().server()))
                .toList()) {

            if (remaining <= 0) {
                break;
            }

            int take = Math.min(remaining, entry.getValue());
            trimmed.put(entry.getKey(), take);
            remaining -= take;
        }

        return trimmed;
    }

    /**
     * Removes the items and reports exactly how many of each actually came out.
     *
     * The returned counts are what the payment is calculated from, rather than what was requested.
     * If anything changed between counting and removing — another plugin moved an item, the player
     * dropped a stack — the player is paid for what was genuinely taken and nothing more.
     */
    private Map<SellPrice, Integer> remove(Player player, Map<SellPrice, Integer> selling) {
        Map<SellPrice, Integer> removed = new LinkedHashMap<>();

        for (Map.Entry<SellPrice, Integer> entry : selling.entrySet()) {
            org.bukkit.Material material = org.bukkit.Material.matchMaterial(entry.getKey().itemKey());

            if (material == null) {
                continue;
            }

            int wanted = entry.getValue();
            int taken = 0;

            ItemStack[] contents = player.getInventory().getStorageContents();

            for (int slot = 0; slot < contents.length && taken < wanted; slot++) {
                ItemStack stack = contents[slot];

                if (stack == null || stack.getType() != material) {
                    continue;
                }

                int take = Math.min(stack.getAmount(), wanted - taken);
                taken += take;

                if (take >= stack.getAmount()) {
                    player.getInventory().setItem(slot, null);
                } else {
                    stack.setAmount(stack.getAmount() - take);
                    player.getInventory().setItem(slot, stack);
                }
            }

            if (taken > 0) {
                removed.put(entry.getKey(), taken);
            }
        }

        return removed;
    }

    /**
     * Gives items back after a failed payment.
     *
     * Anything that does not fit is dropped at the player's feet rather than deleted. Dropping is
     * ugly; deleting items a player owned because their inventory filled up during a failed sale is
     * not something that can be defended.
     */
    private void refund(Player player, Map<SellPrice, Integer> removed) {
        for (Map.Entry<SellPrice, Integer> entry : removed.entrySet()) {
            org.bukkit.Material material = org.bukkit.Material.matchMaterial(entry.getKey().itemKey());

            if (material == null) {
                continue;
            }

            int remaining = entry.getValue();

            while (remaining > 0) {
                int size = Math.min(remaining, material.getMaxStackSize());
                ItemStack stack = new ItemStack(material, size);

                player.getInventory().addItem(stack).values()
                        .forEach(leftover -> player.getWorld().dropItemNaturally(player.getLocation(), leftover));

                remaining -= size;
            }
        }
    }
}
