package org.robtic.minecraft.progression.workspace;

import com.google.gson.JsonObject;
import org.bukkit.Material;
import org.bukkit.inventory.ItemStack;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A workspace's virtual storage: item counts, not an inventory.
 *
 * <h2>Why not chests</h2>
 *
 * The brief rules them out, and the reasons are worth stating because they are the same reasons this
 * shape was chosen. A chest is a block, so it can be broken, hopper-drained, chunk-unloaded, or
 * destroyed by a rollback — and its capacity is fixed at 27 slots by Minecraft rather than by the
 * upgrade tier. Storage that lives in data has none of those failure modes: it cannot be griefed, it
 * backs up with everything else, and its capacity is whatever the tier says.
 *
 * <h2>Counts, not stacks</h2>
 *
 * Stored as material → quantity rather than as a list of {@link ItemStack}s. Two consequences, both
 * intended: a thousand cobblestone is one entry rather than sixteen stacks, and the "capacity" an
 * upgrade raises is a meaningful number of items rather than a number of slots that behaves
 * differently for shulker boxes than for cobblestone.
 *
 * The cost is that item metadata is lost — an enchanted pickaxe becomes a pickaxe. That is why the
 * default filter accepts only the profession materials a job actually deals in, where metadata is
 * meaningless. It is also why the filter is configurable rather than hard-coded: a server that later
 * wants tools in here needs a different storage shape, and should hit a deliberate boundary rather
 * than silently lose enchantments.
 *
 * <h2>Immutable</h2>
 *
 * Copy-on-write, like every other value in this system: read on the tick by the GUI, written from
 * API callbacks, and neither needs a lock.
 *
 * @param contents material name → quantity. Never holds a zero or negative entry
 */
public record WorkspaceStorage(Map<String, Integer> contents) {

    public static final WorkspaceStorage EMPTY = new WorkspaceStorage(Map.of());

    /**
     * Normalises on the way in, so no other method has to defend against a bad entry.
     *
     * A null key, a null count or a count at or below zero is dropped rather than stored. The record
     * documents that it never holds one, and the type system cannot enforce it — anything that
     * reaches here from a decoded file, an extension or a future migration is otherwise free to break
     * that promise, and the visible symptom would be storage that reports itself as empty because a
     * negative count cancelled out a real one.
     */
    public WorkspaceStorage {
        Map<String, Integer> checked = new LinkedHashMap<>();

        contents.forEach((material, amount) -> {
            if (material != null && !material.isBlank() && amount != null && amount > 0) {
                checked.put(material, amount);
            }
        });

        contents = Map.copyOf(checked);
    }

    /** How many items are held in total, which is what capacity limits. */
    public int used() {
        int total = 0;

        for (int amount : contents.values()) {
            // Saturating: a corrupted record with an enormous count must not wrap into a negative
            // and make the storage look empty.
            total = total > Integer.MAX_VALUE - amount ? Integer.MAX_VALUE : total + amount;
        }

        return total;
    }

    public int amountOf(Material material) {
        return contents.getOrDefault(material.name(), 0);
    }

    public boolean isEmpty() {
        return contents.isEmpty();
    }

    /** How many distinct materials are held, for the GUI's page count. */
    public int distinctItems() {
        return contents.size();
    }

    /**
     * Adds items, up to a capacity.
     *
     * @return what was actually stored and what would not fit, so the caller can hand the remainder
     *         back to the player rather than deleting it
     */
    public Deposit deposit(Material material, int amount, int capacity) {
        if (amount <= 0) {
            return new Deposit(this, 0, 0);
        }

        int room = Math.max(0, capacity - used());
        int stored = Math.min(room, amount);

        if (stored == 0) {
            return new Deposit(this, 0, amount);
        }

        Map<String, Integer> next = new LinkedHashMap<>(contents);
        next.merge(material.name(), stored, Integer::sum);

        return new Deposit(new WorkspaceStorage(next), stored, amount - stored);
    }

    /**
     * Removes items.
     *
     * @return the new storage and how many actually came out, which may be fewer than asked for
     */
    public Withdrawal withdraw(Material material, int amount) {
        int held = amountOf(material);
        int taken = Math.min(Math.max(0, amount), held);

        if (taken == 0) {
            return new Withdrawal(this, 0);
        }

        Map<String, Integer> next = new LinkedHashMap<>(contents);

        // Removed entirely at zero rather than left as an empty entry: a storage that accumulated a
        // key for every material ever held would grow without bound and page badly in the GUI.
        if (taken == held) {
            next.remove(material.name());
        } else {
            next.put(material.name(), held - taken);
        }

        return new Withdrawal(new WorkspaceStorage(next), taken);
    }

    /** The materials held, in insertion order, resolved and with unknown ones dropped. */
    public List<Entry> entries() {
        List<Entry> entries = new ArrayList<>(contents.size());

        contents.forEach((name, amount) -> {
            Material material = Material.matchMaterial(name);

            // A material removed by a Minecraft update is skipped rather than crashing the GUI. The
            // count stays in the data, so it returns if the material ever does.
            if (material != null && amount > 0) {
                entries.add(new Entry(material, amount));
            }
        });

        return entries;
    }

    /** The contents as one line, for the log written when a workspace is released. */
    public String describe() {
        StringBuilder builder = new StringBuilder();

        contents.forEach((material, amount) -> {
            if (!builder.isEmpty()) {
                builder.append(", ");
            }
            builder.append(material).append(" x").append(amount);
        });

        return builder.toString();
    }

    public record Entry(Material material, int amount) {
    }

    /** @param stored how many went in; @param rejected how many did not fit */
    public record Deposit(WorkspaceStorage storage, int stored, int rejected) {
        public boolean full() {
            return rejected > 0;
        }
    }

    public record Withdrawal(WorkspaceStorage storage, int taken) {
    }

    public JsonObject toJson() {
        JsonObject json = new JsonObject();
        JsonObject items = new JsonObject();

        contents.forEach(items::addProperty);
        json.add("items", items);

        return json;
    }

    public static WorkspaceStorage fromJson(JsonObject json) {
        if (json == null || !json.has("items") || !json.get("items").isJsonObject()) {
            return EMPTY;
        }

        JsonObject items = json.getAsJsonObject("items");
        Map<String, Integer> contents = new LinkedHashMap<>();

        for (String key : items.keySet()) {
            try {
                int amount = items.get(key).getAsInt();

                if (amount > 0) {
                    contents.put(key, amount);
                }
            } catch (RuntimeException notANumber) {
                // One unreadable entry is dropped; the rest of the storage still loads. Failing the
                // whole record would lose everything a player had banked.
            }
        }

        return new WorkspaceStorage(contents);
    }
}
