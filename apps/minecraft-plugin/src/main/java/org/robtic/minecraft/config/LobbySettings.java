package org.robtic.minecraft.config;

import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.robtic.minecraft.model.Lobby;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** `lobbies.yml` — the destinations offered by the staff book. */
public final class LobbySettings {

    private final List<Lobby> lobbies;
    private final String menuTitle;
    private final int menuRows;

    LobbySettings(FileConfiguration config) {
        this.menuTitle = config.getString("menu.title", "Staff Lobbies");
        this.menuRows = Math.min(6, Math.max(1, config.getInt("menu.rows", 3)));

        List<Lobby> parsed = new ArrayList<>();
        ConfigurationSection section = config.getConfigurationSection("lobbies");

        if (section != null) {
            int autoSlot = 0;
            for (String key : section.getKeys(false)) {
                ConfigurationSection entry = section.getConfigurationSection(key);
                if (entry == null) {
                    continue;
                }

                String world = entry.getString("world", "").trim();
                if (world.isBlank()) {
                    continue;
                }

                Material icon = Material.matchMaterial(entry.getString("icon", "COMPASS"));

                parsed.add(new Lobby(
                        key.toLowerCase(Locale.ROOT),
                        entry.getString("name", key),
                        world,
                        entry.getDouble("x"),
                        entry.getDouble("y"),
                        entry.getDouble("z"),
                        (float) entry.getDouble("yaw"),
                        (float) entry.getDouble("pitch"),
                        entry.getString("permission", ""),
                        icon == null ? Material.COMPASS : icon,
                        entry.getInt("slot", autoSlot)
                ));

                autoSlot++;
            }
        }

        parsed.sort(Comparator.comparingInt(Lobby::slot));
        this.lobbies = List.copyOf(parsed);
    }

    public List<Lobby> all() {
        return lobbies;
    }

    /** Only the destinations this player may use, so the menu never shows an unusable button. */
    public List<Lobby> visibleTo(Player player) {
        return lobbies.stream().filter(lobby -> lobby.isVisibleTo(player)).toList();
    }

    public String menuTitle() {
        return menuTitle;
    }

    public int menuRows() {
        return menuRows;
    }
}
