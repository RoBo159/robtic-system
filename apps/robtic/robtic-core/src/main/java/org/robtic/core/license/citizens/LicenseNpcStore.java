package org.robtic.core.license.citizens;

import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.io.IOException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Level;

/**
 * Which Citizens NPCs are licence NPCs.
 *
 * <h2>A set, not a single id</h2>
 *
 * The brief asks for one NPC today and several later, and the difference between the two is entirely
 * in this class if it stores a set from the start. Storing one id and generalising later would mean
 * a migration for every server that had already set one.
 *
 * <h2>Ids, not entities</h2>
 *
 * A Citizens NPC id is a stable integer that survives restarts, chunk unloads and the NPC being
 * despawned. Storing the entity's UUID would break the moment Citizens respawned it, which it does
 * routinely — and the symptom would be a licence NPC that stopped working after a restart for
 * reasons nobody could see.
 *
 * <h2>Written immediately, not on a timer</h2>
 *
 * An operator runs {@code /license setnpc} once and expects it to survive a crash. A save on every
 * change is a handful of bytes on an action performed a few times in a server's life.
 */
public final class LicenseNpcStore {

    private final Plugin plugin;
    private final File file;

    private final Set<Integer> npcIds = new LinkedHashSet<>();

    public LicenseNpcStore(Plugin plugin) {
        this.plugin = plugin;
        this.file = new File(plugin.getDataFolder(), "license-npcs.yml");
    }

    /** Reads the stored ids. Called once at enable. */
    public void load() {
        npcIds.clear();

        if (!file.exists()) {
            return;
        }

        YamlConfiguration document = YamlConfiguration.loadConfiguration(file);

        npcIds.addAll(document.getIntegerList("npcs"));

        if (!npcIds.isEmpty()) {
            plugin.getLogger().info("Loaded " + npcIds.size() + " licence NPC(s).");
        }
    }

    private void save() {
        YamlConfiguration document = new YamlConfiguration();
        document.set("npcs", List.copyOf(npcIds));

        try {
            document.save(file);
        } catch (IOException failure) {
            plugin.getLogger().log(Level.WARNING,
                    "Could not save the licence NPC list — it will be lost on restart.", failure);
        }
    }

    /** @return false when this NPC was already a licence NPC */
    public boolean add(int npcId) {
        if (!npcIds.add(npcId)) {
            return false;
        }

        save();
        return true;
    }

    /** @return false when this NPC was not a licence NPC */
    public boolean remove(int npcId) {
        if (!npcIds.remove(npcId)) {
            return false;
        }

        save();
        return true;
    }

    public boolean contains(int npcId) {
        return npcIds.contains(npcId);
    }

    public Set<Integer> all() {
        return Set.copyOf(npcIds);
    }

    public int size() {
        return npcIds.size();
    }
}
