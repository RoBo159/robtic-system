package org.robtic.core.model;

import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.inventory.PlayerInventory;
import org.robtic.core.util.ItemSerialization;

/**
 * A player's complete state at the moment staff mode was enabled.
 *
 * This is the object the whole no-item-loss guarantee rests on. It is captured on the main thread,
 * sent to the API, and stored there **before** anything is cleared — so whatever happens next, the
 * snapshot already exists somewhere that survives a crash.
 *
 * The item blobs are Bukkit's own Base64 serialisation, which is version-tolerant in a way a
 * hand-rolled format would not be.
 */
public record PlayerSnapshot(
        String inventory,
        String armor,
        String offhand,
        String enderChest,
        int xpLevel,
        float xpProgress,
        int food,
        double health,
        int heldSlot,
        String world,
        double x,
        double y,
        double z,
        float yaw,
        float pitch
) {

    /** Captures a player. Main thread only — reading an inventory off it is not safe. */
    public static PlayerSnapshot capture(Player player) {
        PlayerInventory inventory = player.getInventory();
        Location location = player.getLocation();

        return new PlayerSnapshot(
                ItemSerialization.encode(inventory.getStorageContents()),
                ItemSerialization.encode(inventory.getArmorContents()),
                ItemSerialization.encode(new org.bukkit.inventory.ItemStack[]{inventory.getItemInOffHand()}),
                ItemSerialization.encode(player.getEnderChest().getContents()),
                player.getLevel(),
                player.getExp(),
                player.getFoodLevel(),
                player.getHealth(),
                inventory.getHeldItemSlot(),
                location.getWorld().getName(),
                location.getX(),
                location.getY(),
                location.getZ(),
                location.getYaw(),
                location.getPitch()
        );
    }

    /**
     * Puts everything back. Main thread only.
     *
     * The ender chest is restored only when it was captured, because an older snapshot taken
     * before that field existed would otherwise wipe it.
     */
    public void restore(Player player) {
        PlayerInventory inventory = player.getInventory();

        inventory.setStorageContents(ItemSerialization.decode(this.inventory));
        inventory.setArmorContents(ItemSerialization.decode(armor));

        org.bukkit.inventory.ItemStack[] offhandItems = ItemSerialization.decode(offhand);
        inventory.setItemInOffHand(offhandItems.length > 0 ? offhandItems[0] : null);

        if (enderChest != null && !enderChest.isBlank()) {
            player.getEnderChest().setContents(ItemSerialization.decode(enderChest));
        }

        player.setLevel(xpLevel);
        player.setExp(xpProgress);
        player.setFoodLevel(food);

        // Clamped: a max-health attribute lowered while the player was in staff mode would make
        // the stored value illegal and throw, losing the rest of the restore with it.
        double maxHealth = player.getAttribute(org.bukkit.attribute.Attribute.MAX_HEALTH).getValue();
        player.setHealth(Math.min(health, maxHealth));

        inventory.setHeldItemSlot(Math.min(8, Math.max(0, heldSlot)));

        Location target = toLocation();
        if (target != null) {
            player.teleport(target);
        }
    }

    /** Null when the recorded world no longer exists, which leaves the player where they are. */
    public Location toLocation() {
        World target = Bukkit.getWorld(world);
        return target == null ? null : new Location(target, x, y, z, yaw, pitch);
    }

    public JsonObject toJson() {
        JsonObject location = new JsonObject();
        location.addProperty("world", world);
        location.addProperty("x", x);
        location.addProperty("y", y);
        location.addProperty("z", z);
        location.addProperty("yaw", yaw);
        location.addProperty("pitch", pitch);

        JsonObject json = new JsonObject();
        json.addProperty("inventory", inventory);
        json.addProperty("armor", armor);
        json.addProperty("offhand", offhand);
        json.addProperty("enderChest", enderChest);
        json.addProperty("xpLevel", xpLevel);
        json.addProperty("xpProgress", xpProgress);
        json.addProperty("food", food);
        json.addProperty("health", health);
        json.addProperty("heldSlot", heldSlot);
        json.add("location", location);
        return json;
    }

    public static PlayerSnapshot fromJson(JsonObject json) {
        JsonObject location = json.getAsJsonObject("location");

        return new PlayerSnapshot(
                json.get("inventory").getAsString(),
                json.get("armor").getAsString(),
                json.get("offhand").getAsString(),
                json.has("enderChest") && !json.get("enderChest").isJsonNull()
                        ? json.get("enderChest").getAsString()
                        : null,
                json.get("xpLevel").getAsInt(),
                json.get("xpProgress").getAsFloat(),
                json.get("food").getAsInt(),
                json.get("health").getAsDouble(),
                json.get("heldSlot").getAsInt(),
                location.get("world").getAsString(),
                location.get("x").getAsDouble(),
                location.get("y").getAsDouble(),
                location.get("z").getAsDouble(),
                location.get("yaw").getAsFloat(),
                location.get("pitch").getAsFloat()
        );
    }
}
