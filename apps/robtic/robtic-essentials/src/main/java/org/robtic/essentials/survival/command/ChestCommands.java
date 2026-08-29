package org.robtic.essentials.survival.command;

import com.google.gson.JsonObject;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.block.Chest;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.entitlement.Entitlements;
import org.robtic.essentials.model.SurvivalModels.LockedChests;
import org.robtic.essentials.model.SurvivalModels.StoredLocation;
import org.robtic.essentials.survival.SurvivalCacheService;

import java.util.Optional;

/**
 * The premium chest commands: `/lock`, `/unlock`, `/locks`, `/ec`, `/linkchest` and `/chest`.
 *
 * <h2>Tier gates are read from the cache, not hardcoded</h2>
 *
 * Whether a player may lock a chest, and how many, comes from their cached entitlements. The API
 * enforces the same limits again when the write lands — this side exists so a free player gets an
 * immediate, accurate message instead of a round trip ending in a refusal.
 */
public final class ChestCommands implements CommandExecutor {

    /** How far ahead `/lock` and `/linkchest` look for a chest. */
    private static final int REACH = 6;

    private final ApiGateway gateway;
    private final MessageCatalog messages;
    private final SurvivalCacheService cache;

    public ChestCommands(ApiGateway gateway, MessageCatalog messages, SurvivalCacheService cache) {
        this.gateway = gateway;
        this.messages = messages;
        this.cache = cache;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("That command can only be run by a player.");
            return true;
        }

        switch (command.getName().toLowerCase()) {
            case "lock" -> lock(player);
            case "unlock" -> unlock(player);
            case "locks" -> locks(player);
            case "ec" -> enderChest(player);
            case "linkchest" -> linkChest(player);
            case "chest" -> openLinkedChest(player);
            default -> {
                return false;
            }
        }

        return true;
    }

    // ─── Ender chest ──────────────────────────────────────────────────────────────────────────

    /** Purely local: the ender chest is the player's own inventory, so nothing is stored anywhere. */
    private void enderChest(Player player) {
        Entitlements premium = cache.cachedPremium(player.getUniqueId());

        if (!premium.cosmetics() && !player.hasPermission("robtic.enderchest")) {
            player.sendMessage(messages.prefixed("survival.premium-only"));
            return;
        }

        player.openInventory(player.getEnderChest());
        player.sendMessage(messages.prefixed("survival.ec-opened"));
    }

    // ─── Locked chests ────────────────────────────────────────────────────────────────────────

    private void lock(Player player) {
        Entitlements premium = cache.cachedPremium(player.getUniqueId());

        if (premium.lockedChestLimit() <= 0) {
            player.sendMessage(messages.prefixed("survival.lock-not-premium"));
            return;
        }

        Optional<Block> chest = targetChest(player);
        if (chest.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.no-chest-in-sight"));
            return;
        }

        StoredLocation at = StoredLocation.of(chest.get().getLocation());

        gateway.read(
                () -> cache.lock(player.getUniqueId(), player.getName(), at),
                response -> reportLock(player, response, "survival.chest-locked"),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void unlock(Player player) {
        Optional<Block> chest = targetChest(player);
        if (chest.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.no-chest-in-sight"));
            return;
        }

        StoredLocation at = StoredLocation.of(chest.get().getLocation());

        gateway.read(
                () -> cache.unlock(player.getUniqueId(), at),
                response -> reportLock(player, response, "survival.chest-unlocked"),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    /**
     * Turns the API's structured outcome into a sentence.
     *
     * The reasons are distinct on purpose — "you have used all of your locks" and "that chest
     * belongs to somebody else" call for different actions from the player.
     */
    private void reportLock(Player player, JsonObject response, String successKey) {
        boolean applied = response.has("applied") && response.get("applied").getAsBoolean();
        String reason = response.has("reason") ? response.get("reason").getAsString() : "unknown";
        int count = response.has("count") ? response.get("count").getAsInt() : 0;
        int limit = response.has("limit") ? response.get("limit").getAsInt() : 0;

        if (applied) {
            player.sendMessage(messages.prefixed(successKey,
                    "used", String.valueOf(count), "limit", String.valueOf(limit)));
            return;
        }

        String owner = response.has("ownerUsername") && !response.get("ownerUsername").isJsonNull()
                ? response.get("ownerUsername").getAsString()
                : "someone";

        player.sendMessage(switch (reason) {
            case "limit-reached" -> messages.prefixed("survival.lock-limit",
                    "used", String.valueOf(count), "limit", String.valueOf(limit));
            case "owned-by-other" -> messages.prefixed("survival.chest-owned", "player", owner);
            case "not-locked" -> messages.prefixed("survival.chest-not-locked");
            case "not-premium" -> messages.prefixed("survival.lock-not-premium");
            default -> messages.prefixed("survival.unavailable");
        });
    }

    private void locks(Player player) {
        gateway.read(
                () -> cache.loadLocks(player.getUniqueId()),
                locks -> sendLockList(player, locks),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void sendLockList(Player player, LockedChests locks) {
        if (locks.chests().isEmpty()) {
            player.sendMessage(messages.prefixed("survival.locks-none"));
            return;
        }

        player.sendMessage(messages.prefixed("survival.locks-header",
                "used", String.valueOf(locks.chests().size()), "limit", String.valueOf(locks.limit())));

        for (StoredLocation chest : locks.chests()) {
            player.sendMessage(messages.prefixed("survival.locks-row",
                    "world", chest.world(),
                    "x", String.valueOf(Math.round(chest.x())),
                    "y", String.valueOf(Math.round(chest.y())),
                    "z", String.valueOf(Math.round(chest.z()))));
        }
    }

    // ─── Portable chest ───────────────────────────────────────────────────────────────────────

    private void linkChest(Player player) {
        Entitlements premium = cache.cachedPremium(player.getUniqueId());

        if (!premium.portableChest()) {
            player.sendMessage(messages.prefixed("survival.portable-not-premium"));
            return;
        }

        Optional<Block> chest = targetChest(player);
        if (chest.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.no-chest-in-sight"));
            return;
        }

        StoredLocation at = StoredLocation.of(chest.get().getLocation());

        gateway.read(
                () -> cache.linkChest(player.getUniqueId(), at),
                linked -> player.sendMessage(messages.prefixed("survival.chest-linked")),
                error -> player.sendMessage("FORBIDDEN".equals(error.code())
                        ? messages.prefixed("survival.portable-not-premium")
                        : messages.prefixed("survival.unavailable")));
    }

    /**
     * Opens the linked chest from anywhere.
     *
     * The real block is opened rather than a copy of its contents, so the chest stays an ordinary
     * chest — it can still be emptied, broken or piped into, and nothing has to reconcile a
     * duplicate inventory afterwards.
     */
    private void openLinkedChest(Player player) {
        Entitlements premium = cache.cachedPremium(player.getUniqueId());

        if (!premium.portableChest()) {
            player.sendMessage(messages.prefixed("survival.portable-not-premium"));
            return;
        }

        gateway.read(
                () -> cache.loadPortableChest(player.getUniqueId()),
                location -> openAt(player, location),
                error -> player.sendMessage(messages.prefixed("survival.unavailable")));
    }

    private void openAt(Player player, Optional<StoredLocation> location) {
        if (location.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.chest-not-linked"));
            return;
        }

        Optional<org.bukkit.Location> bukkit = location.get().toBukkit();
        if (bukkit.isEmpty()) {
            player.sendMessage(messages.prefixed("survival.world-missing", "world", location.get().world()));
            return;
        }

        Block block = bukkit.get().getBlock();

        // The chest may have been broken since it was linked, which the API cannot know.
        if (!(block.getState() instanceof Chest chest)) {
            player.sendMessage(messages.prefixed("survival.chest-gone"));
            return;
        }

        player.openInventory(chest.getInventory());
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────────────────────

    /** The chest the player is looking at, within reach. */
    private Optional<Block> targetChest(Player player) {
        Block block = player.getTargetBlockExact(REACH);

        if (block == null) {
            return Optional.empty();
        }

        return block.getType() == Material.CHEST || block.getType() == Material.TRAPPED_CHEST
                ? Optional.of(block)
                : Optional.empty();
    }
}
