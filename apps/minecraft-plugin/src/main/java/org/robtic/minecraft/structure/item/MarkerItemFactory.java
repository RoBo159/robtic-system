package org.robtic.minecraft.structure.item;

import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.block.Block;
import org.bukkit.block.Sign;
import org.bukkit.block.TileState;
import org.bukkit.block.data.BlockData;
import org.bukkit.block.data.Directional;
import org.bukkit.block.data.Rotatable;
import org.bukkit.block.sign.Side;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.progression.api.WorldPoint;
import org.robtic.minecraft.structure.api.MarkerType;
import org.robtic.minecraft.structure.api.PlacedMarker;
import org.robtic.minecraft.util.Chat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The one class that knows how a marker is encoded — as an item, and as a block in the world.
 *
 * <h2>Why a marker cannot be an invisible block and still carry its data</h2>
 *
 * This is the constraint the whole design bends around, so it is worth stating plainly. Bukkit can
 * attach persistent data only to blocks that have a tile entity. Every invisible, walk-through block
 * Minecraft has — {@code structure_void}, {@code light}, {@code barrier}, air itself — has no tile
 * entity and therefore cannot carry a single byte. The data <em>must</em> live in the block, because
 * it has to survive being saved into a schematic and pasted back out by BetterStructures, and a
 * schematic preserves block state and tile-entity NBT and nothing else.
 *
 * So the marker is a block with a tile entity while it is being designed, and stops being a block at
 * all once it has been read:
 *
 * <ol>
 *   <li><b>Design.</b> The builder places a sign. Its persistent data carries the type, a unique id,
 *       a format version and any metadata. Its text says which marker it is, so a builder can see
 *       ten markers in a room and tell them apart without clicking any of them.</li>
 *   <li><b>Schematic.</b> WorldEdit and FAWE round-trip tile-entity NBT, and Bukkit's persistent
 *       data lives inside it, so the marker arrives in the generated building intact.</li>
 *   <li><b>Generation.</b> The scanner reads every marker into a
 *       {@link org.robtic.minecraft.structure.api.MarkerSet}, persists it, and clears the blocks to
 *       {@code structure_void}. From that moment the marker is invisible, has no collision and has
 *       no effect on gameplay — it is the invisible development marker that was asked for, and the
 *       data it used to carry now lives somewhere that cannot be broken with a pickaxe.</li>
 * </ol>
 *
 * <h2>A sign, specifically</h2>
 *
 * Of the blocks that can carry data, a sign is the only one with no collision box — so it is
 * walk-through even during the design phase — and the only one that can label itself in the world.
 * Both matter to a builder placing markers by hand. The material is configurable for a server that
 * wants something else; anything with a tile entity works.
 *
 * <h2>Identity is in the container, never in the text</h2>
 *
 * The sign's lines are written for humans and are never read back. A player who finds a marker and
 * copies its text onto their own sign has made a sign. Only the persistent data counts, and only
 * this plugin can write it.
 */
public final class MarkerItemFactory {

    /**
     * The marker format version.
     *
     * Written onto every marker and checked when one is read. A marker from a newer plugin than the
     * one reading it is reported rather than guessed at, because a format this system does not know
     * may mean something it would get wrong — and a schematic outlives the plugin build that made
     * it, so this will happen.
     */
    public static final int VERSION = 1;

    private final Plugin plugin;

    private final NamespacedKey typeKey;
    private final NamespacedKey idKey;
    private final NamespacedKey versionKey;
    private final NamespacedKey metaKey;

    public MarkerItemFactory(Plugin plugin) {
        this.plugin = plugin;

        this.typeKey = new NamespacedKey(plugin, "marker_type");
        this.idKey = new NamespacedKey(plugin, "marker_id");
        this.versionKey = new NamespacedKey(plugin, "marker_version");
        this.metaKey = new NamespacedKey(plugin, "marker_meta");
    }

    // ─── Items ────────────────────────────────────────────────────────────────────────────────

    /**
     * Builds the item a builder places.
     *
     * The item is the marker <em>block's</em> material rather than the type's icon, because it has
     * to be placeable as that block. The type's icon is what the menu shows; a builder never sees
     * the two side by side, and an item that looked right but could not be placed would be worse
     * than one that looks generic and works.
     *
     * No marker id is written here. Ids are assigned when the block is placed — see
     * {@link #stamp} — so that two items from the same menu click cannot become two markers claiming
     * to be the same one.
     */
    public ItemStack create(MarkerType type, Material blockMaterial) {
        ItemStack stack = new ItemStack(blockMaterial, 1);
        ItemMeta meta = stack.getItemMeta();

        if (meta == null) {
            return stack;
        }

        PersistentDataContainer data = meta.getPersistentDataContainer();

        data.set(typeKey, PersistentDataType.STRING, type.id());
        data.set(versionKey, PersistentDataType.INTEGER, VERSION);

        writeMetadata(data, type.defaults());

        meta.displayName(Chat.component(type.display()).decoration(TextDecoration.ITALIC, false));

        List<net.kyori.adventure.text.Component> lore = new ArrayList<>();

        for (String line : type.description()) {
            lore.add(Chat.component("&7" + line).decoration(TextDecoration.ITALIC, false));
        }

        lore.add(Chat.component("").decoration(TextDecoration.ITALIC, false));
        lore.add(Chat.component("&8Marker · " + type.id()).decoration(TextDecoration.ITALIC, false));
        lore.add(Chat.component("&8Place it where this belongs.").decoration(TextDecoration.ITALIC, false));

        meta.lore(lore);

        if (type.modelData() > 0) {
            meta.setCustomModelData(type.modelData());
        }

        meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_ENCHANTS,
                ItemFlag.HIDE_ADDITIONAL_TOOLTIP);

        stack.setItemMeta(meta);

        return stack;
    }

    /** Whether an item carries marker data at all. The cheap check before anything reads a container. */
    public boolean isMarker(ItemStack stack) {
        if (stack == null || stack.getType().isAir() || !stack.hasItemMeta()) {
            return false;
        }

        ItemMeta meta = stack.getItemMeta();

        return meta != null && meta.getPersistentDataContainer().has(typeKey, PersistentDataType.STRING);
    }

    /** What a marker item says it is. Empty when the item is not a marker. */
    public Optional<ItemMarker> readItem(ItemStack stack) {
        if (!isMarker(stack)) {
            return Optional.empty();
        }

        PersistentDataContainer data = stack.getItemMeta().getPersistentDataContainer();
        String typeId = data.get(typeKey, PersistentDataType.STRING);

        if (typeId == null || typeId.isBlank()) {
            return Optional.empty();
        }

        return Optional.of(new ItemMarker(
                typeId,
                data.getOrDefault(versionKey, PersistentDataType.INTEGER, VERSION),
                readMetadata(data)));
    }

    /** A marker item's contents, before it becomes a block. */
    public record ItemMarker(String typeId, int version, Map<String, String> metadata) {

        public ItemMarker {
            metadata = Map.copyOf(metadata);
        }
    }

    // ─── Blocks ───────────────────────────────────────────────────────────────────────────────

    /**
     * Writes marker data onto a block that has just been placed, and labels it.
     *
     * A fresh id is minted here rather than copied from the item, so every marker in a structure is
     * individually addressable. Once the structure is saved as a schematic that id travels with it,
     * which is what makes "NPC slot 3 in this building" a thing a log line can name.
     *
     * @return the marker as it will now be read back, or empty when the block cannot hold data
     */
    public Optional<PlacedMarker> stamp(Block block, MarkerType type, Map<String, String> metadata) {
        if (!(block.getState() instanceof TileState state)) {
            return Optional.empty();
        }

        String markerId = UUID.randomUUID().toString();

        PersistentDataContainer data = state.getPersistentDataContainer();

        data.set(typeKey, PersistentDataType.STRING, type.id());
        data.set(idKey, PersistentDataType.STRING, markerId);
        data.set(versionKey, PersistentDataType.INTEGER, VERSION);

        writeMetadata(data, metadata);

        label(state, type);

        // Applied without a physics update: a marker frequently sits in mid-air where an NPC will
        // stand, and a physics tick would pop a floating sign off as an item.
        state.update(true, false);

        return Optional.of(new PlacedMarker(markerId, type.id(), VERSION, pointOf(block), metadata));
    }

    /**
     * Writes the human-readable label onto a sign marker.
     *
     * Never read back — see the class comment. It exists so a builder walking through a half-finished
     * structure can see what they placed, and so a marker left in a schematic by accident is
     * identifiable by whoever opens it.
     *
     * Waxed, so the text cannot be edited in-world. That is not a security measure — the persistent
     * data is what matters — but it stops a builder editing a line and believing they changed
     * something.
     */
    private void label(TileState state, MarkerType type) {
        if (!(state instanceof Sign sign)) {
            return;
        }

        var front = sign.getSide(Side.FRONT);

        front.line(0, Chat.component("&8&l◆ &7ROBTIC"));
        front.line(1, Chat.component(type.display()));
        front.line(2, Chat.component(type.spawnsNpc() ? "&8" + type.npcRole() : "&8" + type.id()));
        front.line(3, Chat.component(type.level() > 0 ? "&8level " + type.level() : "&8marker"));

        sign.setWaxed(true);
    }

    /** Whether a block could be a marker, without loading its state. */
    public boolean couldBeMarker(Block block, Material configured) {
        return block != null && block.getType() == configured;
    }

    /**
     * Reads a marker out of a block.
     *
     * @return empty when the block has no tile entity, or its container holds no marker data — the
     *         two cases every caller treats identically
     */
    public Optional<PlacedMarker> read(Block block) {
        if (block == null || !(block.getState() instanceof TileState state)) {
            return Optional.empty();
        }

        PersistentDataContainer data = state.getPersistentDataContainer();
        String typeId = data.get(typeKey, PersistentDataType.STRING);

        if (typeId == null || typeId.isBlank()) {
            return Optional.empty();
        }

        return Optional.of(new PlacedMarker(
                data.getOrDefault(idKey, PersistentDataType.STRING, ""),
                typeId.toLowerCase(Locale.ROOT),
                data.getOrDefault(versionKey, PersistentDataType.INTEGER, VERSION),
                pointOf(block),
                readMetadata(data)));
    }

    /**
     * A marker's position, carrying the facing the builder aimed the sign at.
     *
     * The rotation of the block is the facing of whatever gets placed there. It costs a builder
     * nothing — they are placing the sign anyway — and it removes the most common reason to write
     * metadata by hand. A {@code yaw} metadata value still overrides it; see
     * {@link PlacedMarker#yaw()}.
     */
    private WorldPoint pointOf(Block block) {
        WorldPoint base = WorldPoint.ofBlock(block.getLocation());

        return new WorldPoint(base.world(), base.x(), base.y(), base.z(), yawOf(block.getBlockData()), 0f);
    }

    /**
     * Turns a block's facing into a yaw.
     *
     * Derived from the face's own offsets rather than a lookup table, so the sixteen-way rotations a
     * standing sign supports all resolve without enumerating them. The integer offsets Bukkit
     * publishes make the diagonal cases accurate to a couple of degrees, which is well below what
     * anybody can see on a standing NPC.
     */
    private static float yawOf(BlockData data) {
        org.bukkit.block.BlockFace face = null;

        if (data instanceof Rotatable rotatable) {
            face = rotatable.getRotation();
        } else if (data instanceof Directional directional) {
            face = directional.getFacing();
        }

        if (face == null || (face.getModX() == 0 && face.getModZ() == 0)) {
            return 0f;
        }

        return (float) Math.toDegrees(Math.atan2(-face.getModX(), face.getModZ()));
    }

    // ─── Metadata encoding ────────────────────────────────────────────────────────────────────

    /**
     * Metadata goes in a nested container rather than a packed string.
     *
     * A packed {@code key=value;key=value} string would need escaping rules that a builder writing a
     * value containing a semicolon would eventually break. A nested container has no such rule, is
     * what Bukkit's own API is shaped for, and survives the schematic round trip identically because
     * it is the same NBT compound either way.
     */
    private void writeMetadata(PersistentDataContainer data, Map<String, String> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return;
        }

        PersistentDataContainer nested = data.getAdapterContext().newPersistentDataContainer();

        metadata.forEach((key, value) -> {
            String safe = sanitise(key);

            if (!safe.isEmpty() && value != null) {
                nested.set(new NamespacedKey(plugin, safe), PersistentDataType.STRING, value);
            }
        });

        data.set(metaKey, PersistentDataType.TAG_CONTAINER, nested);
    }

    private Map<String, String> readMetadata(PersistentDataContainer data) {
        PersistentDataContainer nested = data.get(metaKey, PersistentDataType.TAG_CONTAINER);

        if (nested == null) {
            return Map.of();
        }

        Map<String, String> metadata = new LinkedHashMap<>();

        for (NamespacedKey key : nested.getKeys()) {
            String value = nested.get(key, PersistentDataType.STRING);

            if (value != null) {
                metadata.put(key.getKey().toLowerCase(Locale.ROOT), value);
            }
        }

        return metadata;
    }

    /**
     * Makes a metadata key usable as a namespaced key.
     *
     * Bukkit accepts only lowercase letters, digits, underscore, dash, dot and slash. A key with a
     * space in it would throw on construction and take down whatever was writing it, so it is
     * rewritten instead. The validator separately reports keys a type did not declare, which is
     * where a builder finds out they typed something unexpected.
     */
    private static String sanitise(String key) {
        if (key == null) {
            return "";
        }

        StringBuilder safe = new StringBuilder(key.length());

        for (char character : key.toLowerCase(Locale.ROOT).toCharArray()) {
            safe.append(switch (character) {
                case 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
                     'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
                     '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
                     '_', '-', '.', '/' -> character;
                default -> '_';
            });
        }

        return safe.toString();
    }
}
