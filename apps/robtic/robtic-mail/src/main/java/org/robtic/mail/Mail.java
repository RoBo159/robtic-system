package org.robtic.mail;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.bukkit.Material;

import java.util.ArrayList;
import java.util.List;

/**
 * One message in a player's mailbox.
 *
 * <h2>Why the body is a list</h2>
 *
 * Because it is rendered into a written book, and a book has pages. Splitting free-form text into
 * lines at render time means guessing where a line break belongs; splitting it where it was written
 * means the sender decided, and a blank entry is a deliberate paragraph break rather than an
 * accident of wrapping.
 */
public record Mail(
        String id,
        String category,
        String subject,
        List<String> body,
        String senderName,
        boolean important,
        boolean read,
        String referenceId,
        String createdAt
) {

    /**
     * The icon this mail shows in the list.
     *
     * Falls through to a plain book for a category this build has never heard of, so a newer API
     * adding one does not produce an empty slot in an older plugin's mailbox.
     */
    public Material icon() {
        return switch (category) {
            case "report_accepted" -> Material.LIME_DYE;
            case "report_refused" -> Material.GRAY_DYE;
            case "jailed" -> Material.IRON_BARS;
            case "warned" -> Material.PAPER;
            default -> read ? Material.BOOK : Material.WRITTEN_BOOK;
        };
    }

    public static Mail fromJson(JsonObject json) {
        return new Mail(
                string(json, "id", ""),
                string(json, "category", "system"),
                string(json, "subject", "(no subject)"),
                lines(json),
                string(json, "senderName", "Server"),
                bool(json, "important"),
                bool(json, "read"),
                string(json, "referenceId", null),
                string(json, "createdAt", "")
        );
    }

    /** Reads an `{ items: [...] }` envelope, which is the shape both mail endpoints return. */
    public static List<Mail> listFromJson(JsonObject json) {
        JsonElement items = json.get("items");

        if (items == null || !items.isJsonArray()) {
            return List.of();
        }

        JsonArray array = items.getAsJsonArray();
        List<Mail> mails = new ArrayList<>(array.size());

        for (JsonElement element : array) {
            if (element.isJsonObject()) {
                mails.add(fromJson(element.getAsJsonObject()));
            }
        }

        return List.copyOf(mails);
    }

    public static int unreadFromJson(JsonObject json) {
        JsonElement unread = json.get("unread");
        return unread == null || unread.isJsonNull() ? 0 : unread.getAsInt();
    }

    private static List<String> lines(JsonObject json) {
        JsonElement body = json.get("body");

        if (body == null || !body.isJsonArray()) {
            return List.of();
        }

        List<String> rendered = new ArrayList<>();
        for (JsonElement line : body.getAsJsonArray()) {
            rendered.add(line.isJsonNull() ? "" : line.getAsString());
        }

        return List.copyOf(rendered);
    }

    private static String string(JsonObject json, String key, String fallback) {
        JsonElement element = json.get(key);
        return element == null || element.isJsonNull() ? fallback : element.getAsString();
    }

    private static boolean bool(JsonObject json, String key) {
        JsonElement element = json.get(key);
        return element != null && !element.isJsonNull() && element.getAsBoolean();
    }
}
