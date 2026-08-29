package org.robtic.core.util;

import org.bukkit.inventory.ItemStack;
import org.bukkit.util.io.BukkitObjectInputStream;
import org.bukkit.util.io.BukkitObjectOutputStream;
import org.yaml.snakeyaml.external.biz.base64Coder.Base64Coder;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Base64 encoding of item arrays, using Bukkit's own object streams.
 *
 * Bukkit's serialiser is used rather than a hand-rolled format because it round-trips every kind
 * of item metadata — custom names, enchantments, NBT written by other plugins, shulker contents —
 * and stays readable across Minecraft versions. A bespoke format would silently lose whatever it
 * had not been taught about, and this is the code path a staff member's entire inventory goes
 * through.
 *
 * Failures return an empty array rather than throwing: a snapshot that cannot be decoded is a
 * serious problem, but throwing here would abort a restore midway and lose the rest of it too.
 */
public final class ItemSerialization {

    private ItemSerialization() {
    }

    public static String encode(ItemStack[] items) {
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream();
             BukkitObjectOutputStream output = new BukkitObjectOutputStream(bytes)) {

            output.writeInt(items.length);
            for (ItemStack item : items) {
                output.writeObject(item);
            }
            output.flush();

            return Base64Coder.encodeLines(bytes.toByteArray());
        } catch (IOException error) {
            throw new IllegalStateException("Could not serialise an item array", error);
        }
    }

    public static ItemStack[] decode(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            return new ItemStack[0];
        }

        try (ByteArrayInputStream bytes = new ByteArrayInputStream(Base64Coder.decodeLines(encoded));
             BukkitObjectInputStream input = new BukkitObjectInputStream(bytes)) {

            ItemStack[] items = new ItemStack[input.readInt()];
            for (int index = 0; index < items.length; index++) {
                items[index] = (ItemStack) input.readObject();
            }

            return items;
        } catch (IOException | ClassNotFoundException | RuntimeException error) {
            return new ItemStack[0];
        }
    }
}
