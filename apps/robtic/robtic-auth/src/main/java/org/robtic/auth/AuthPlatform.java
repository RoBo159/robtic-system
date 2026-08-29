package org.robtic.auth;

import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

/**
 * Which client a player is on, and therefore which login surface they can be shown.
 *
 * <h2>Bedrock is detected without the Floodgate API</h2>
 *
 * Floodgate mints a UUID for every Bedrock player whose most significant bits are zero — the
 * xuid-derived form {@code 00000000-0000-0000-xxxx-xxxxxxxxxxxx}. A real Mojang UUID is version 4
 * and can never look like that, so the test is exact and needs no library at all.
 *
 * Doing it this way means Bedrock players are recognised even on a server that has Geyser but not
 * the Floodgate API on the plugin classpath — they simply receive the next surface down rather than
 * being mistaken for Java clients and shown a dialog their client cannot render.
 *
 * <h2>Dialog support is a server question, not a client one</h2>
 *
 * The Dialog API is Paper 1.21.7 and later. This plugin is compiled against it, so the classes are
 * always present at compile time — but an operator can run the jar on an older server, where the
 * class is missing at runtime and touching it throws {@link NoClassDefFoundError}. That is checked
 * once, by name, and cached: a per-player check would be a class lookup on every join.
 */
public final class AuthPlatform {

    /** Resolved once. Looking the class up per player would cost a lookup on every join. */
    private static final boolean DIALOGS_AVAILABLE = classExists("io.papermc.paper.dialog.Dialog");

    private final Plugin plugin;

    public AuthPlatform(Plugin plugin) {
        this.plugin = plugin;
    }

    /**
     * True when this player reached the server through Geyser.
     *
     * The zero high bits are the signature of a Floodgate-issued UUID. A Java player's UUID is
     * random and version 4, so a collision would require the top 64 bits to be zero by chance.
     */
    public boolean isBedrock(Player player) {
        return player.getUniqueId().getMostSignificantBits() == 0L;
    }

    /** Whether the running server exposes the Dialog API at all. */
    public boolean supportsDialogs() {
        return DIALOGS_AVAILABLE;
    }

    /** Whether Floodgate is installed, for the native Bedrock form surface. */
    public boolean floodgateInstalled() {
        return plugin.getServer().getPluginManager().getPlugin("floodgate") != null;
    }

    private static boolean classExists(String name) {
        try {
            Class.forName(name);
            return true;
        } catch (ClassNotFoundException | LinkageError missing) {
            return false;
        }
    }
}
