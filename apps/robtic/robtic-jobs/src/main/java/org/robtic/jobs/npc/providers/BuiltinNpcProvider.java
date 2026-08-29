package org.robtic.jobs.npc.providers;

import org.bukkit.Location;
import org.bukkit.NamespacedKey;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Mob;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityTargetEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.Plugin;
import org.robtic.jobs.npc.NpcDefinition;
import org.robtic.jobs.npc.NpcHandle;
import org.robtic.jobs.npc.NpcProvider;
import org.robtic.core.util.Chat;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * NPCs built from plain Paper entities, with no NPC plugin at all.
 *
 * <h2>The fallback that means neither plugin is required</h2>
 *
 * A server without Citizens still gets working recruiters and sellers. That
 * matters more than it sounds: without it, "install one of these two plugins" becomes a hard
 * prerequisite for the entire jobs system, and a server that had not would find its guild buildings
 * generating empty.
 *
 * It is genuinely the weakest of the three — these are real entities, so they count against the mob
 * cap, are visible to other plugins as villagers, and need the protections below — which is why it
 * is chosen last.
 *
 * <h2>Identity lives on the entity</h2>
 *
 * Written into persistent data rather than a map, so it survives chunk unloads, restarts and world
 * saves. A memory map does not: the entity outlives it, and after a restart the world is full of
 * villagers the server no longer recognises — unclickable, unremovable, and indistinguishable from
 * real ones.
 */
public final class BuiltinNpcProvider implements NpcProvider, Listener {

    public static final String NAME = "builtin";

    private final Plugin plugin;
    private final NamespacedKey definitionKey;
    private final NamespacedKey ownerKey;

    private volatile NpcInteraction handler = (player, handle) -> {
    };

    public BuiltinNpcProvider(Plugin plugin) {
        this.plugin = plugin;
        this.definitionKey = new NamespacedKey(plugin, "npc_definition");
        this.ownerKey = new NamespacedKey(plugin, "npc_owner");

        plugin.getServer().getPluginManager().registerEvents(this, plugin);
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean available() {
        // Nothing to be unavailable. That is the point of this provider.
        return true;
    }

    @Override
    public void onInteract(NpcInteraction handler) {
        this.handler = handler == null ? (player, handle) -> {
        } : handler;
    }

    @Override
    public Optional<NpcHandle> spawn(NpcDefinition definition, Location location, String owner) {
        if (location.getWorld() == null) {
            return Optional.empty();
        }

        Class<? extends Entity> entityClass = definition.type().getEntityClass();

        if (entityClass == null || !LivingEntity.class.isAssignableFrom(entityClass)) {
            plugin.getLogger().warning("Cannot spawn NPC \"" + definition.id() + "\": "
                    + definition.type() + " is not a living entity.");
            return Optional.empty();
        }

        try {
            @SuppressWarnings("unchecked")
            Class<? extends LivingEntity> living = (Class<? extends LivingEntity>) entityClass;

            // Configured inside the spawn consumer rather than after the entity exists, closing the
            // tick-wide window in which a fresh villager could wander, be hit, or be traded with.
            LivingEntity entity = location.getWorld().spawn(location, living,
                    spawned -> configure(spawned, definition, owner));

            return Optional.of(NpcHandle.of(NAME, entity.getUniqueId()));
        } catch (IllegalArgumentException | IllegalStateException refused) {
            plugin.getLogger().warning("Could not spawn NPC \"" + definition.id() + "\": "
                    + refused.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Makes an ordinary entity behave as an NPC.
     *
     * Each flag closes a specific way a mob stops being usable: invulnerable so a player cannot kill
     * the only recruiter in a structure, no gravity and no AI so it does not walk off or fall into a
     * cave, silent because a room of villagers is unbearable, persistent so the mob cap does not
     * cull it.
     */
    private void configure(LivingEntity entity, NpcDefinition definition, String owner) {
        entity.getPersistentDataContainer().set(definitionKey, PersistentDataType.STRING, definition.id());
        entity.getPersistentDataContainer().set(ownerKey, PersistentDataType.STRING, owner);

        entity.customName(Chat.component(definition.name()));
        entity.setCustomNameVisible(true);

        entity.setInvulnerable(true);
        entity.setSilent(true);
        entity.setPersistent(true);
        entity.setRemoveWhenFarAway(false);
        entity.setCollidable(false);
        entity.setGravity(false);
        entity.setGlowing(definition.glowing());

        if (entity instanceof Mob mob) {
            mob.setAware(definition.lookAtPlayers());
        }

        if (entity instanceof Villager villager) {
            applyProfession(villager, definition);
        }
    }

    /**
     * Sets a villager's profession and clears its trades.
     *
     * The level is raised above 1 because a level-1 villager with no trades periodically tries to
     * claim a profession from a nearby workstation — which would quietly turn a Miner Guild recruiter
     * into a fletcher if the building happened to contain a fletching table.
     */
    private void applyProfession(Villager villager, NpcDefinition definition) {
        try {
            Villager.Profession profession = org.bukkit.Registry.VILLAGER_PROFESSION.get(
                    NamespacedKey.minecraft(definition.profession().toLowerCase(Locale.ROOT)));

            if (profession != null) {
                villager.setProfession(profession);
            }
        } catch (IllegalArgumentException unknown) {
            plugin.getLogger().warning("NPC \"" + definition.id()
                    + "\" names an unknown villager profession \"" + definition.profession() + "\".");
        }

        villager.setVillagerLevel(2);
        villager.setRecipes(java.util.List.of());
    }

    @Override
    public boolean remove(NpcHandle handle) {
        return entity(handle).map(entity -> {
            entity.remove();
            return true;
        }).orElse(false);
    }

    @Override
    public boolean exists(NpcHandle handle) {
        return entity(handle).isPresent();
    }

    @Override
    public Optional<NpcHandle> identify(Entity entity) {
        return isNpc(entity)
                ? Optional.of(NpcHandle.of(NAME, entity.getUniqueId()))
                : Optional.empty();
    }

    @Override
    public Optional<String> definitionOf(NpcHandle handle) {
        return entity(handle).map(entity ->
                entity.getPersistentDataContainer().get(definitionKey, PersistentDataType.STRING));
    }

    @Override
    public Optional<String> ownerOf(NpcHandle handle) {
        return entity(handle).map(entity ->
                entity.getPersistentDataContainer().get(ownerKey, PersistentDataType.STRING));
    }

    /**
     * Removes every loaded NPC with this owner tag.
     *
     * Scans only entities the server already has in memory, so it never forces a chunk load — which
     * would turn a cleanup into exactly the performance problem this system avoids elsewhere.
     */
    @Override
    public int removeAllOwnedBy(String owner) {
        int removed = 0;

        for (org.bukkit.World world : plugin.getServer().getWorlds()) {
            for (Entity entity : world.getEntities()) {
                if (isNpc(entity) && owner.equals(
                        entity.getPersistentDataContainer().get(ownerKey, PersistentDataType.STRING))) {
                    entity.remove();
                    removed++;
                }
            }
        }

        return removed;
    }

    private boolean isNpc(Entity entity) {
        return entity != null
                && entity.getPersistentDataContainer().has(definitionKey, PersistentDataType.STRING);
    }

    private Optional<Entity> entity(NpcHandle handle) {
        if (!handle.isFrom(NAME)) {
            return Optional.empty();
        }

        return handle.asUuid()
                .map(uuid -> plugin.getServer().getEntity(uuid))
                .filter(this::isNpc);
    }

    // ─── Events ───────────────────────────────────────────────────────────────────────────────

    @org.bukkit.event.EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onInteract(PlayerInteractEntityEvent event) {
        if (!isNpc(event.getRightClicked())) {
            return;
        }

        // Cancelled as soon as we know it is ours, so a villager NPC never opens a trade window even
        // if nothing below handles it.
        event.setCancelled(true);

        if (event.getHand() != org.bukkit.inventory.EquipmentSlot.HAND) {
            return;
        }

        handler.accept(event.getPlayer(), NpcHandle.of(NAME, event.getRightClicked().getUniqueId()));
    }

    /** Nothing hurts an NPC — not players, not mobs, not fire. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onDamage(EntityDamageByEntityEvent event) {
        if (isNpc(event.getEntity())) {
            event.setCancelled(true);
        }
    }

    /** Stops mobs trailing NPCs around, which invulnerability alone does not prevent. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onTarget(EntityTargetEvent event) {
        if (isNpc(event.getTarget())) {
            event.setCancelled(true);
        }
    }

    /** For migration: the raw tag, even when no definition matches it any more. */
    public Optional<String> rawDefinitionId(Entity entity) {
        return Optional.ofNullable(
                entity.getPersistentDataContainer().get(definitionKey, PersistentDataType.STRING));
    }

    public static UUID entityId(NpcHandle handle) {
        return handle.asUuid().orElse(null);
    }
}
