package org.robtic.minecraft.license.item;

import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.license.api.License;
import org.robtic.minecraft.license.api.LicenseRegistry;
import org.robtic.minecraft.util.Chat;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.function.BiFunction;

/**
 * Builds licence items and reads them back.
 *
 * <h2>The one class a resource pack touches</h2>
 *
 * Everything about how a licence <em>looks</em> is here: the material, the model data, the name, the
 * lore. Nothing else in the plugin constructs a licence item or reads one apart from through this
 * class, so adding a resource pack later means changing {@link #icon} and {@link #render} and
 * nothing else. The registry, the service, the GUI, the commands and the placeholders are all
 * written against ids and dates rather than against items.
 *
 * <h2>Identity is in the container, never in the name</h2>
 *
 * A licence is recognised by its persistent data, and the data is signed — see
 * {@link LicenseSignature}. An item renamed in an anvil to match a licence exactly is not a licence,
 * and neither is one whose PDC was written by hand without the server's key.
 *
 * The name and lore are presentation. They are rebuilt from the current definition every time the
 * item is written, so a rebalanced renewal cost shows up on items that already exist.
 */
public final class LicenseItemFactory {

    // ─── Persistent data keys ─────────────────────────────────────────────────────────────────
    //
    // Namespaced to this plugin, so nothing another plugin writes can be mistaken for one of these
    // and nothing here can collide with theirs.

    private final NamespacedKey idKey;
    private final NamespacedKey serialKey;
    private final NamespacedKey issuedKey;
    private final NamespacedKey expiresKey;
    private final NamespacedKey signatureKey;

    private final LicenseRegistry registry;
    private final LicenseSignature signatures;

    /**
     * Renders the item's lore.
     *
     * Injected so the wording lives in {@code messages.yml} rather than in this class — a server
     * that wants different phrasing, or another language, changes configuration rather than code.
     */
    private final BiFunction<License, Holding, List<String>> lore;

    /** The dates on one item, as read from its container. */
    public record Holding(String serial, long issuedAt, long expiresAt) {

        public boolean permanent() {
            return expiresAt <= 0L;
        }

        public boolean expired(long now) {
            return !permanent() && now >= expiresAt;
        }
    }

    public LicenseItemFactory(
            Plugin plugin,
            LicenseRegistry registry,
            LicenseSignature signatures,
            BiFunction<License, Holding, List<String>> lore
    ) {
        this.registry = registry;
        this.signatures = signatures;
        this.lore = lore;

        this.idKey = new NamespacedKey(plugin, "license_id");
        this.serialKey = new NamespacedKey(plugin, "license_serial");
        this.issuedKey = new NamespacedKey(plugin, "license_issued");
        this.expiresKey = new NamespacedKey(plugin, "license_expires");
        this.signatureKey = new NamespacedKey(plugin, "license_signature");
    }

    // ─── Creating ─────────────────────────────────────────────────────────────────────────────

    /**
     * Issues a new licence item.
     *
     * Each carries its own serial, so two copies of the same licence are distinguishable in a log
     * even though they are otherwise identical — which is what makes "where did this come from"
     * answerable when somebody reports a duplicate.
     */
    public ItemStack create(License license, long issuedAt) {
        String serial = UUID.randomUUID().toString();
        long expiresAt = license.expiryFrom(issuedAt);

        ItemStack stack = new ItemStack(icon(license), 1);

        write(stack, license, new Holding(serial, issuedAt, expiresAt));

        return stack;
    }

    /**
     * Writes a licence's data and appearance onto an item, in place.
     *
     * Used both to issue one and to renew one. Renewal deliberately goes through the same path: the
     * signature covers the expiry, so changing the expiry without re-signing would produce an item
     * that fails its own validation.
     */
    public void write(ItemStack stack, License license, Holding holding) {
        ItemMeta meta = stack.getItemMeta();

        if (meta == null) {
            return;
        }

        PersistentDataContainer data = meta.getPersistentDataContainer();

        data.set(idKey, PersistentDataType.STRING, license.id());
        data.set(serialKey, PersistentDataType.STRING, holding.serial());
        data.set(issuedKey, PersistentDataType.LONG, holding.issuedAt());
        data.set(expiresKey, PersistentDataType.LONG, holding.expiresAt());
        data.set(signatureKey, PersistentDataType.STRING, signatures.sign(
                license.id(), holding.serial(), holding.issuedAt(), holding.expiresAt()));

        meta.displayName(Chat.component(license.display()).decoration(
                net.kyori.adventure.text.format.TextDecoration.ITALIC, false));

        List<net.kyori.adventure.text.Component> rendered = new ArrayList<>();

        for (String line : lore.apply(license, holding)) {
            rendered.add(Chat.component(line).decoration(
                    net.kyori.adventure.text.format.TextDecoration.ITALIC, false));
        }

        meta.lore(rendered);

        if (license.modelData() > 0) {
            meta.setCustomModelData(license.modelData());
        }

        // Attributes and enchantments are hidden rather than avoided: a resource pack may later want
        // an enchantment glint on a rare licence, and the flags mean adding one does not also add a
        // wall of numeric lore under the description.
        meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_ENCHANTS, ItemFlag.HIDE_ADDITIONAL_TOOLTIP);

        stack.setItemMeta(meta);
    }

    /**
     * The material a licence uses.
     *
     * Falls back rather than failing: an icon naming a material that a Minecraft update removed
     * should produce a plain licence, not a licence nobody can be issued.
     */
    private Material icon(License license) {
        Material material = Material.matchMaterial(license.icon().toUpperCase(Locale.ROOT));

        return material == null || material.isAir() ? Material.PAPER : material;
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    /**
     * Whether an item carries licence data at all.
     *
     * The cheap pre-check every inventory scan runs first. An item with no meta — most of a player's
     * inventory — is rejected without a container lookup.
     */
    public boolean looksLikeLicense(ItemStack stack) {
        if (stack == null || stack.getType().isAir() || !stack.hasItemMeta()) {
            return false;
        }

        ItemMeta meta = stack.getItemMeta();

        return meta != null && meta.getPersistentDataContainer().has(idKey, PersistentDataType.STRING);
    }

    /**
     * Reads a licence item, if it is a genuine one.
     *
     * @return empty when the item is not a licence, when its licence is not registered, or when its
     *         signature does not match — the three cases a caller treats identically, because a
     *         forgery must be as unusable as a stick
     */
    public Optional<Read> read(ItemStack stack) {
        if (!looksLikeLicense(stack)) {
            return Optional.empty();
        }

        PersistentDataContainer data = stack.getItemMeta().getPersistentDataContainer();

        String id = data.get(idKey, PersistentDataType.STRING);
        String serial = data.getOrDefault(serialKey, PersistentDataType.STRING, "");
        long issued = data.getOrDefault(issuedKey, PersistentDataType.LONG, 0L);
        long expires = data.getOrDefault(expiresKey, PersistentDataType.LONG, 0L);
        String signature = data.getOrDefault(signatureKey, PersistentDataType.STRING, "");

        if (id == null || id.isBlank()) {
            return Optional.empty();
        }

        Optional<License> license = registry.get(id);

        if (license.isEmpty()) {
            // A licence whose definition is not loaded — a plugin that is disabled, or a config entry
            // that was deleted. The item is left alone and simply does nothing; see LicenseRegistry.
            return Optional.empty();
        }

        if (!signatures.verify(id, serial, issued, expires, signature)) {
            return Optional.of(new Read(license.get(), new Holding(serial, issued, expires), false));
        }

        return Optional.of(new Read(license.get(), new Holding(serial, issued, expires), true));
    }

    /**
     * What one item turned out to be.
     *
     * The forged case is reported rather than swallowed so a caller can log it — a player carrying a
     * forged licence is worth knowing about, and returning an empty Optional would make it
     * indistinguishable from a stick.
     */
    public record Read(License license, Holding holding, boolean genuine) {
    }

    // ─── Rendering helpers, for the default lore ──────────────────────────────────────────────

    /** A duration as "3d 4h", "5h 12m" or "40s" — enough precision to act on, not enough to be noise. */
    public static String describe(Duration duration) {
        long days = duration.toDays();

        if (days > 0) {
            return days + "d " + duration.toHoursPart() + "h";
        }

        if (duration.toHours() > 0) {
            return duration.toHours() + "h " + duration.toMinutesPart() + "m";
        }

        return duration.toMinutes() > 0
                ? duration.toMinutes() + "m"
                : Math.max(0, duration.toSecondsPart()) + "s";
    }

    private static final DateTimeFormatter DATES =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.ROOT);

    /** An instant as a local date and time, for an expiry shown on an item. */
    public static String date(long epochMillis) {
        return epochMillis <= 0L
                ? "-"
                : DATES.format(Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()));
    }
}
