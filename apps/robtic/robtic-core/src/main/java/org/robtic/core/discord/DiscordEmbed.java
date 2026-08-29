package org.robtic.core.discord;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/**
 * A Discord embed, described without knowing Discord's JSON shape.
 *
 * <h2>Why a builder rather than a map</h2>
 *
 * Every plugin that logs to Discord builds the same thing: a title, a colour, some fields, a
 * timestamp. Handing them a {@code JsonObject} would mean each one learning Discord's field names —
 * and each one getting the colour encoding subtly wrong, because it is a decimal integer rather than
 * the hex string every other API uses.
 *
 * The names here are Discord's, since there is no value in inventing synonyms, but the encoding is
 * this class's problem.
 *
 * @param title       heading, may be null
 * @param description body text, may be null
 * @param colour      RGB, as {@code 0xRRGGBB}; negative for none
 * @param fields      name/value pairs shown under the description
 * @param footer      small text at the bottom, may be null
 * @param timestamp   epoch milliseconds, or 0 for none
 */
public record DiscordEmbed(
        String title,
        String description,
        int colour,
        List<Field> fields,
        String footer,
        long timestamp
) {

    /** One name/value pair. {@code inline} puts it beside its neighbours rather than on its own row. */
    public record Field(String name, String value, boolean inline) {
    }

    public DiscordEmbed {
        fields = List.copyOf(fields);
    }

    public static Builder builder() {
        return new Builder();
    }

    /**
     * Discord's own wire shape.
     *
     * Built here and nowhere else, so the one place that knows {@code color} is spelled without a
     * `u` and encoded as a decimal is this method.
     */
    public JsonObject toJson() {
        JsonObject json = new JsonObject();

        if (title != null && !title.isBlank()) {
            json.addProperty("title", title);
        }

        if (description != null && !description.isBlank()) {
            json.addProperty("description", description);
        }

        if (colour >= 0) {
            json.addProperty("color", colour);
        }

        if (!fields.isEmpty()) {
            JsonArray array = new JsonArray();

            for (Field field : fields) {
                JsonObject entry = new JsonObject();

                entry.addProperty("name", field.name());
                entry.addProperty("value", field.value());
                entry.addProperty("inline", field.inline());

                array.add(entry);
            }

            json.add("fields", array);
        }

        if (footer != null && !footer.isBlank()) {
            JsonObject foot = new JsonObject();
            foot.addProperty("text", footer);
            json.add("footer", foot);
        }

        if (timestamp > 0L) {
            json.addProperty("timestamp",
                    java.time.Instant.ofEpochMilli(timestamp).toString());
        }

        return json;
    }

    public static final class Builder {

        private String title;
        private String description;
        private int colour = -1;
        private String footer;
        private long timestamp;

        private final List<Field> fields = new ArrayList<>();

        public Builder title(String title) {
            this.title = title;
            return this;
        }

        public Builder description(String description) {
            this.description = description;
            return this;
        }

        /** @param colour {@code 0xRRGGBB}. Negative leaves the embed uncoloured. */
        public Builder colour(int colour) {
            this.colour = colour;
            return this;
        }

        public Builder field(String name, String value) {
            return field(name, value, false);
        }

        public Builder field(String name, String value, boolean inline) {
            // Discord rejects an embed with a blank field name or value, and rejecting the whole
            // message because one optional detail was absent would lose the log line entirely.
            if (name != null && !name.isBlank() && value != null && !value.isBlank()) {
                fields.add(new Field(name, value, inline));
            }

            return this;
        }

        public Builder footer(String footer) {
            this.footer = footer;
            return this;
        }

        public Builder timestamp(long epochMillis) {
            this.timestamp = epochMillis;
            return this;
        }

        /** Stamps the embed with the current time. */
        public Builder now() {
            return timestamp(System.currentTimeMillis());
        }

        public DiscordEmbed build() {
            return new DiscordEmbed(title, description, colour, fields, footer, timestamp);
        }
    }
}
