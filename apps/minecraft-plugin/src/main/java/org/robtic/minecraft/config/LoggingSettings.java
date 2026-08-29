package org.robtic.minecraft.config;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * `logging.yml` — which staff actions this server reports.
 *
 * Note what is *not* here: no channel ids, no webhook URLs. The plugin names an action and the API
 * resolves the destination from the guild's configuration. That keeps every Discord identifier out
 * of the game server's files, and means re-pointing a log stream is a Discord-side change rather
 * than an edit-and-restart on each server.
 */
public final class LoggingSettings {

    private final Set<String> enabledActions = new HashSet<>();
    private final boolean logToConsole;
    private final boolean logToDiscord;
    private final boolean logApiErrors;

    LoggingSettings(FileConfiguration config) {
        this.logToConsole = config.getBoolean("console", true);
        this.logToDiscord = config.getBoolean("discord", true);
        this.logApiErrors = config.getBoolean("api-errors", true);

        ConfigurationSection actions = config.getConfigurationSection("actions");
        if (actions == null) {
            return;
        }

        for (String key : actions.getKeys(false)) {
            if (actions.getBoolean(key, true)) {
                enabledActions.add(key.toLowerCase(Locale.ROOT));
            }
        }
    }

    /**
     * Whether an action is reported.
     *
     * An action absent from the file defaults to enabled: a new action added by a plugin update
     * should be audited by default, and an operator who wants it quiet can say so explicitly.
     */
    public boolean isEnabled(String action) {
        return enabledActions.isEmpty() || enabledActions.contains(action.toLowerCase(Locale.ROOT));
    }

    public boolean logToConsole() {
        return logToConsole;
    }

    public boolean logToDiscord() {
        return logToDiscord;
    }

    public boolean logApiErrors() {
        return logApiErrors;
    }
}
