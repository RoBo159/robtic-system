package org.robtic.minecraft.config;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * `messages.yml` — every player-facing string, addressed by key.
 *
 * The previous design declared one field and one getter per message, which was tolerable for a
 * dozen strings and would be unmanageable for the sixty the staff system adds. Keying the whole
 * file means adding a message is a YAML edit and nothing else, and a message the operator has
 * deleted degrades to a visible placeholder rather than a null.
 */
public final class MessageCatalog {

    private static final LegacyComponentSerializer SERIALIZER = LegacyComponentSerializer.legacyAmpersand();

    private final Map<String, String> messages = new LinkedHashMap<>();
    private final String prefix;

    MessageCatalog(FileConfiguration config) {
        this.prefix = config.getString("prefix", "");

        for (String key : config.getKeys(true)) {
            if (config.isString(key)) {
                // Read without an explicit fallback, deliberately.
                //
                // Bukkit's two-argument getString does not consult the configuration's defaults —
                // the caller's own default wins the moment it is supplied. Passing "" therefore
                // suppressed the packaged copy that ConfigRegistry had just installed as the
                // defaults, and every message a plugin update added read back as an empty string
                // on an existing install: present in getKeys, isString true, value blank. In game
                // that is a line consisting of the prefix and nothing else, which looks like the
                // message was sent and lost rather than like a key that needs adding.
                String value = config.getString(key);
                messages.put(key, value == null ? "" : value);
            } else if (config.isList(key)) {
                // A list is joined with newlines so multi-line notices stay a single message.
                messages.put(key, String.join("\n", config.getStringList(key)));
            }
        }
    }

    public String prefix() {
        return prefix;
    }

    /**
     * The raw string, or a visible marker so a missing key is obvious rather than silent.
     *
     * A blank value counts as missing. An empty string renders as a bare prefix, which reads as a
     * message that failed to send rather than as one that needs writing — the marker is the whole
     * point of this method and a key an operator blanked deserves it as much as an absent one.
     */
    public String raw(String key) {
        String value = messages.get(key);
        return value == null || value.isBlank() ? "&c<missing message: " + key + ">" : value;
    }

    public boolean has(String key) {
        return messages.containsKey(key);
    }

    /**
     * Resolves a key and substitutes `%placeholder%` pairs.
     *
     * Arguments are supplied as alternating name and value, which keeps a call readable at the
     * site without a builder for what is usually one or two substitutions.
     */
    public String text(String key, Object... placeholders) {
        return substitute(raw(key), placeholders);
    }

    /** The message as a component, without the prefix. */
    public Component component(String key, Object... placeholders) {
        return SERIALIZER.deserialize(text(key, placeholders));
    }

    /** The message as a component, with the configured prefix — the usual form for chat. */
    public Component prefixed(String key, Object... placeholders) {
        return SERIALIZER.deserialize(prefix + text(key, placeholders));
    }

    /** A multi-line message split into one component per line. */
    public List<Component> lines(String key, Object... placeholders) {
        List<Component> rendered = new java.util.ArrayList<>();
        for (String line : text(key, placeholders).split("\n")) {
            rendered.add(SERIALIZER.deserialize(line));
        }
        return rendered;
    }

    /** Renders an arbitrary legacy string, for text that is not itself a catalog entry. */
    public static Component render(String legacy) {
        return SERIALIZER.deserialize(legacy);
    }

    private String substitute(String template, Object... placeholders) {
        if (placeholders.length == 0) {
            return template;
        }

        Map<String, String> values = new HashMap<>();
        for (int index = 0; index + 1 < placeholders.length; index += 2) {
            values.put(String.valueOf(placeholders[index]), String.valueOf(placeholders[index + 1]));
        }

        String result = template;
        for (Map.Entry<String, String> entry : values.entrySet()) {
            result = result.replace("%" + entry.getKey() + "%", entry.getValue());
        }

        return result;
    }
}
