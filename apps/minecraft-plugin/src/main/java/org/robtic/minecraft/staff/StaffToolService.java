package org.robtic.minecraft.staff;

import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.robtic.minecraft.config.ItemCatalog;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.model.StaffItem;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The staff hotbar: handing the tools out, taking them back, and rate-limiting their use.
 *
 * What each tool *does* is not decided here. `items.yml` names an action id per click, and
 * {@link StaffActionDispatcher} resolves that id to behaviour — so moving "freeze" from the blaze
 * rod to a stick is a config edit rather than a code change.
 */
public final class StaffToolService {

    private final ItemCatalog items;
    private final MessageCatalog messages;

    /** Per-player, per-tool cooldown expiry, so one tool cannot be spammed into an API flood. */
    private final Map<UUID, Map<String, Long>> cooldowns = new ConcurrentHashMap<>();

    public StaffToolService(ItemCatalog items, MessageCatalog messages) {
        this.items = items;
        this.messages = messages;
    }

    /**
     * Equips the configured kit.
     *
     * A tool whose permission the player lacks is skipped rather than given and then refused on
     * use, which keeps the hotbar honest about what that player can actually do.
     */
    public void give(Player player) {
        for (StaffItem item : items.all()) {
            if (!item.permission().isBlank() && !player.hasPermission(item.permission())) {
                continue;
            }
            player.getInventory().setItem(item.slot(), item.toItemStack());
        }

        player.getInventory().setHeldItemSlot(items.all().isEmpty() ? 0 : items.all().get(0).slot());
    }

    /**
     * Removes the kit.
     *
     * Only slots that currently hold a recognised tool are cleared. Clearing by slot index alone
     * would destroy whatever a restore had already put there if the two ever ran out of order.
     */
    public void remove(Player player) {
        for (StaffItem item : items.all()) {
            ItemStack current = player.getInventory().getItem(item.slot());
            if (current == null) {
                continue;
            }

            String name = current.hasItemMeta() && current.getItemMeta().hasDisplayName()
                    ? net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer.plainText()
                        .serialize(current.getItemMeta().displayName())
                    : null;

            if (items.match(current.getType(), name).isPresent()) {
                player.getInventory().setItem(item.slot(), null);
            }
        }

        cooldowns.remove(player.getUniqueId());
    }

    /** Resolves a held stack back to its catalog entry, or empty when it is not a staff tool. */
    public Optional<StaffItem> resolve(ItemStack stack) {
        if (stack == null || !stack.hasItemMeta() || !stack.getItemMeta().hasDisplayName()) {
            return Optional.empty();
        }

        String name = net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer.plainText()
                .serialize(stack.getItemMeta().displayName());

        return items.match(stack.getType(), name);
    }

    /**
     * Consumes a use of a tool, honouring its cooldown.
     *
     * Returns false and tells the player when the tool is still cooling down, so the caller can
     * treat "not ready" and "not allowed" identically at the call site.
     */
    public boolean tryUse(Player player, StaffItem item) {
        if (!item.permission().isBlank() && !player.hasPermission(item.permission())) {
            player.sendMessage(messages.prefixed("staff.no-permission"));
            return false;
        }

        if (!item.hasCooldown()) {
            return true;
        }

        Map<String, Long> playerCooldowns = cooldowns.computeIfAbsent(player.getUniqueId(), key -> new HashMap<>());
        long now = System.currentTimeMillis();
        long readyAt = playerCooldowns.getOrDefault(item.id(), 0L);

        if (now < readyAt) {
            player.sendActionBar(messages.component("staff.tool-cooldown",
                    "seconds", String.valueOf(Math.max(1, (readyAt - now) / 1000))));
            return false;
        }

        playerCooldowns.put(item.id(), now + item.cooldownMillis());
        return true;
    }

    public void forget(UUID uuid) {
        cooldowns.remove(uuid);
    }
}
