package org.robtic.core.placeholder;

import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;
import org.bukkit.plugin.Plugin;
import org.jetbrains.annotations.NotNull;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * The single PlaceholderAPI expansion for the entire Robtic ecosystem.
 *
 * <h2>Why exactly one, in Core</h2>
 *
 * PlaceholderAPI allows one expansion per identifier, and all 183 Robtic placeholders answer to
 * {@code robtic}. Ten plugins cannot each register it: the second registration is refused, and every
 * placeholder that plugin owns silently returns the raw text instead of a value. There is no
 * partial-failure mode to design around — it is one owner or none.
 *
 * So Core owns the identifier and every other plugin contributes through {@link Extension}. That is
 * not a new pattern: the monolith already routes licences, statistics and progression through this
 * exact interface. What changes is that the built-in cases go too — this class no longer knows what
 * AFK, staff ranks or leaderboards are, because in the split it cannot: those live in plugins Core
 * must not depend on.
 *
 * <h2>Registration order, and why it stops mattering</h2>
 *
 * A feature plugin enables after Core and registers its extension then. Because the expansion
 * consults its extensions at resolve time rather than caching a snapshot at registration, a
 * placeholder starts working the moment its owner registers — no ordering requirement, and no
 * re-registration of the expansion itself.
 *
 * <h2>Absent PlaceholderAPI</h2>
 *
 * Nothing here is reached. {@link #install} is the only entry point and it checks first, so a server
 * without PlaceholderAPI gets one line in the log at startup and no other consequence. Extensions
 * still register; they are simply never consulted.
 */
public final class RobticPlaceholders extends PlaceholderExpansion {

    /** The prefix every Robtic placeholder shares: {@code %robtic_…%}. */
    public static final String IDENTIFIER = "robtic";

    private final Plugin plugin;

    /**
     * Copy-on-write because extensions are added at plugin enable and read on every placeholder
     * resolution — which happens on the main thread for scoreboards and in whatever thread a chat
     * plugin uses. Writes are a handful at boot; reads are constant.
     */
    private final List<Extension> extensions = new CopyOnWriteArrayList<>();

    public RobticPlaceholders(Plugin plugin) {
        this.plugin = plugin;
    }

    /**
     * One plugin's contribution.
     *
     * Exists so a feature can expose placeholders without this class importing it — the reason the
     * expansion can live in Core at all.
     */
    @FunctionalInterface
    public interface Extension {

        /**
         * @param key the placeholder with the {@code robtic_} prefix already stripped, lowercased
         * @return the value, or null if this extension does not recognise the key
         */
        String resolve(OfflinePlayer player, String key);
    }

    /**
     * Adds a contributor.
     *
     * Safe at any point in the server's life, not just at boot — see the class comment on ordering.
     */
    public void extend(Extension extension) {
        if (extension != null) {
            extensions.add(extension);
        }
    }

    /**
     * Registers the expansion if PlaceholderAPI is installed.
     *
     * @return whether it was registered, so the caller can log one line either way rather than this
     *         class deciding how to phrase it
     */
    public boolean install() {
        if (plugin.getServer().getPluginManager().getPlugin("PlaceholderAPI") == null) {
            return false;
        }

        return register();
    }

    @Override
    public @NotNull String getIdentifier() {
        return IDENTIFIER;
    }

    @Override
    public @NotNull String getAuthor() {
        return String.join(", ", plugin.getPluginMeta().getAuthors());
    }

    @Override
    public @NotNull String getVersion() {
        return plugin.getPluginMeta().getVersion();
    }

    /**
     * Survives a PlaceholderAPI reload.
     *
     * Without this, {@code /papi reload} unregisters the expansion and nothing re-registers it until
     * the server restarts — every Robtic placeholder on every scoreboard goes blank and the cause is
     * a command somebody ran an hour earlier.
     */
    @Override
    public boolean persist() {
        return true;
    }

    /**
     * Resolves a placeholder by asking each extension in turn.
     *
     * First non-null answer wins. Two plugins claiming the same key is a bug in whoever added the
     * second one, and resolving it by registration order is both stable and the only option that
     * does not require Core to know which of them ought to have priority.
     */
    @Override
    public String onRequest(OfflinePlayer player, @NotNull String params) {
        String key = params.toLowerCase(Locale.ROOT);

        for (Extension extension : extensions) {
            String value = extension.resolve(player, key);

            if (value != null) {
                return value;
            }
        }

        // Null rather than an empty string: PlaceholderAPI renders the raw %robtic_whatever% text,
        // which tells whoever wrote the scoreboard that the key is wrong. An empty string would look
        // like a value that happens to be blank.
        return null;
    }

    /** How many plugins have contributed, for a startup log line. */
    public int extensionCount() {
        return extensions.size();
    }
}
