package org.robtic.dragonbattle.config;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * `messages.yml` — every player-facing string, addressed by key.
 *
 * Keyed rather than declared field by field: adding a message becomes a YAML edit and nothing else,
 * and a key an operator has deleted degrades to a visible marker rather than a null or a blank line
 * that reads as a message which failed to send.
 */
public final class MessageCatalog {

    private static final LegacyComponentSerializer SERIALIZER = LegacyComponentSerializer.legacyAmpersand();

    private final Map<String, String> messages = new LinkedHashMap<>();
    private final String prefix;

    public MessageCatalog(FileConfiguration config) {
        this.prefix = config.getString("prefix", "");

        for (String key : config.getKeys(true)) {
            if (config.isString(key)) {
                String value = config.getString(key);
                messages.put(key, value == null ? "" : value);
            } else if (config.isList(key)) {
                messages.put(key, String.join("\n", config.getStringList(key)));
            }
        }
    }

    /** The raw string, or a visible marker so a missing key is obvious rather than silent. */
    public String raw(String key) {
        String value = messages.get(key);
        return value == null || value.isBlank() ? "&c<missing message: " + key + ">" : value;
    }

    public String text(String key, Object... placeholders) {
        return substitute(raw(key), placeholders);
    }

    public Component component(String key, Object... placeholders) {
        return SERIALIZER.deserialize(text(key, placeholders));
    }

    /** The message with the configured prefix — the usual form for chat. */
    public Component prefixed(String key, Object... placeholders) {
        return SERIALIZER.deserialize(prefix + text(key, placeholders));
    }

    /** Renders an arbitrary legacy string, for text that is not itself a catalog entry. */
    public static Component render(String legacy) {
        return SERIALIZER.deserialize(legacy);
    }

    /** Substitutes `%name%` pairs supplied as alternating name and value. */
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
