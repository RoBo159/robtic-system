package org.robtic.minecraft.statistics;

import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.inventory.CraftItemEvent;
import org.bukkit.event.player.PlayerFishEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;

/**
 * Records the facts the server itself produces — blocks, kills, deaths, time played.
 *
 * <h2>Why this exists at all, given statistics are meant to be generic</h2>
 *
 * Every system that owns a domain records its own facts by calling {@link StatisticsService}: the
 * workspace module records upgrades, the economy records what was spent. Nobody owns "a player broke
 * a block" — it is a fact about the server, not about any feature — so if this module did not record
 * it, either every feature would end up with its own block listener or the most useful statistics on
 * the server would not exist.
 *
 * <h2>Nothing here names a statistic</h2>
 *
 * That would reintroduce exactly what the registry removes. The mapping from a vanilla event to a
 * statistic id lives in {@code statistics.yml} — {@code COAL_ORE: coal_mined} — so a server that
 * wants to count amethyst adds a line, and a server that wants none of this leaves the section empty
 * and pays nothing. The code knows about kinds of event; the config knows about statistics.
 *
 * <h2>Cost</h2>
 *
 * {@code BlockBreakEvent} is among the hottest events on a server. A break costs an {@link EnumMap}
 * lookup — an array index — and at most two increments, each a hash lookup and a compare-and-set. The
 * listener is registered at all only when the configuration actually maps something, so a server that
 * records no block statistics does not pay for the handler at every break.
 *
 * MONITOR priority with {@code ignoreCancelled}, throughout: statistics observe, they never decide.
 * Recording at a lower priority would count blocks that a protection plugin then refused to break.
 */
public final class StatisticsRecorder implements Listener {

    private final StatisticsService statistics;

    /**
     * Swapped wholesale on reload rather than the listener being replaced.
     *
     * Bukkit keeps a reference to the object that was registered, so building a new recorder and
     * assigning it to whatever field held the old one changes nothing — the old instance is still the
     * one receiving events. Registering the new one instead leaves both registered, and every block
     * break is counted twice. One instance, one registration, and the rules behind a volatile.
     */
    private volatile Rules rules;

    public StatisticsRecorder(StatisticsService statistics, Rules rules) {
        this.statistics = statistics;
        this.rules = rules;
    }

    public void rules(Rules replacement) {
        this.rules = replacement;
    }

    // ─── Blocks ───────────────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        // Read once into a local. Rules is immutable and the field is volatile, so two reads could
        // straddle a reload and count the block against one configuration's general statistic and
        // another's specific one.
        Rules current = rules;

        record(event.getPlayer().getUniqueId(), current.blockBreakAny,
                current.blockBreak.get(event.getBlock().getType()));
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        Rules current = rules;

        record(event.getPlayer().getUniqueId(), current.blockPlaceAny,
                current.blockPlace.get(event.getBlock().getType()));
    }

    // ─── Combat ───────────────────────────────────────────────────────────────────────────────

    /**
     * A mob a player killed.
     *
     * The killer is read from the entity's own damage bookkeeping rather than from the event, so a
     * kill by an arrow or a wolf still counts for the player who is actually responsible — which is
     * how a player would describe it, and the only version anybody would consider correct.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onEntityDeath(EntityDeathEvent event) {
        Player killer = event.getEntity().getKiller();

        if (killer == null) {
            return;
        }

        Rules current = rules;

        record(killer.getUniqueId(), current.killAny, current.kills.get(event.getEntityType()));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onPlayerDeath(PlayerDeathEvent event) {
        record(event.getEntity().getUniqueId(), rules.deaths, null);

        Player killer = event.getEntity().getKiller();

        if (killer != null) {
            record(killer.getUniqueId(), rules.playerKills, null);
        }
    }

    // ─── Activity ─────────────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onFish(PlayerFishEvent event) {
        if (event.getState() == PlayerFishEvent.State.CAUGHT_FISH) {
            record(event.getPlayer().getUniqueId(), rules.fishCaught, null);
        }
    }

    /**
     * Crafting, counted in items rather than in clicks.
     *
     * A shift-click crafts as many as the inventory allows and fires one event, so counting the event
     * would report a player who crafted a stack of torches as having crafted one. The amount is what
     * a player means by "how many have I made".
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCraft(CraftItemEvent event) {
        if (rules.itemsCrafted == null || !(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        org.bukkit.inventory.ItemStack result = event.getRecipe().getResult();
        int batches = event.isShiftClick() ? batches(event.getInventory().getMatrix()) : 1;

        statistics.add(player.getUniqueId(), rules.itemsCrafted,
                (long) result.getAmount() * batches);
    }

    /**
     * Records a session starting.
     *
     * Not a {@code PlayerJoinEvent} handler, deliberately. The player's record loads asynchronously
     * and replaces whatever was cached, so anything written during the join event is discarded when
     * it arrives — a session counter that incremented there would read zero forever. This is called
     * from {@code StatisticsSystem.onTracked} instead, once the record is real.
     */
    public void recordJoin(UUID playerId) {
        Rules current = rules;

        record(playerId, current.joins, null);

        // setIfAbsent, not raise. A later timestamp is a larger number, so raising would move "first
        // joined" forward on every login — which looks correct until somebody notices that every
        // player on the server first joined today.
        if (current.firstJoin != null) {
            statistics.setIfAbsent(playerId, current.firstJoin, System.currentTimeMillis());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        if (rules.lastSeen != null) {
            statistics.setTimestamp(event.getPlayer().getUniqueId(), rules.lastSeen,
                    System.currentTimeMillis());
        }
    }

    /**
     * Adds a tick of play time to everybody online.
     *
     * Driven by a timer rather than by a session start and end, so a server that crashes does not
     * lose the whole session — the last interval is the most that can be missed. The interval is
     * whatever the caller schedules; the amount added is passed in, so the two cannot drift apart.
     */
    public void recordPlaytime(long millis) {
        Rules current = rules;

        if (millis <= 0L || (current.playtime == null && current.sessionPlaytime == null)) {
            return;
        }

        for (Player online : org.bukkit.Bukkit.getOnlinePlayers()) {
            if (current.playtime != null) {
                statistics.add(online.getUniqueId(), current.playtime, millis);
            }

            // The session counter is the same fact under a session reset policy, so it is fed from
            // the same tick rather than from a separate timer that could drift away from it.
            if (current.sessionPlaytime != null) {
                statistics.add(online.getUniqueId(), current.sessionPlaytime, millis);
            }
        }
    }

    /**
     * How many times a shift-click will repeat a recipe.
     *
     * The limit is the smallest ingredient stack in the grid: crafting stops when any one of them
     * runs out. Bukkit does not report the figure, and counting the event as one craft would record
     * a player who just made a stack of torches as having crafted four.
     *
     * An approximation in one respect — it ignores the player's free inventory space, which can stop
     * the run early — and deliberately so: over-counting by a partial batch is a far smaller error
     * than under-counting by a factor of sixty-four.
     */
    private static int batches(org.bukkit.inventory.ItemStack[] matrix) {
        int smallest = Integer.MAX_VALUE;

        for (org.bukkit.inventory.ItemStack ingredient : matrix) {
            if (ingredient != null && !ingredient.getType().isAir()) {
                smallest = Math.min(smallest, ingredient.getAmount());
            }
        }

        return smallest == Integer.MAX_VALUE ? 1 : Math.max(1, smallest);
    }

    /** Increments the general statistic and the specific one, skipping either when unmapped. */
    private void record(UUID playerId, String general, String specific) {
        if (general != null) {
            statistics.increment(playerId, general);
        }

        if (specific != null) {
            statistics.increment(playerId, specific);
        }
    }

    /**
     * Which vanilla facts map to which statistics.
     *
     * Parsed once from {@code statistics.yml} and immutable thereafter. {@link EnumMap}s because the
     * block lookups are on the hot path and an EnumMap read is an array index rather than a hash.
     */
    public static final class Rules {

        private final Map<Material, String> blockBreak;
        private final Map<Material, String> blockPlace;
        private final Map<EntityType, String> kills;

        private final String blockBreakAny;
        private final String blockPlaceAny;
        private final String killAny;
        private final String playerKills;
        private final String deaths;
        private final String joins;
        private final String firstJoin;
        private final String lastSeen;
        private final String playtime;
        private final String sessionPlaytime;
        private final String fishCaught;
        private final String itemsCrafted;

        private Rules(
                Map<Material, String> blockBreak,
                Map<Material, String> blockPlace,
                Map<EntityType, String> kills,
                String blockBreakAny,
                String blockPlaceAny,
                String killAny,
                String playerKills,
                String deaths,
                String joins,
                String firstJoin,
                String lastSeen,
                String playtime,
                String sessionPlaytime,
                String fishCaught,
                String itemsCrafted
        ) {
            this.blockBreak = blockBreak;
            this.blockPlace = blockPlace;
            this.kills = kills;
            this.blockBreakAny = blockBreakAny;
            this.blockPlaceAny = blockPlaceAny;
            this.killAny = killAny;
            this.playerKills = playerKills;
            this.deaths = deaths;
            this.joins = joins;
            this.firstJoin = firstJoin;
            this.lastSeen = lastSeen;
            this.playtime = playtime;
            this.sessionPlaytime = sessionPlaytime;
            this.fishCaught = fishCaught;
            this.itemsCrafted = itemsCrafted;
        }

        /** Whether anything at all is mapped, so the listener need not be registered. */
        public boolean any() {
            return !blockBreak.isEmpty() || !blockPlace.isEmpty() || !kills.isEmpty()
                    || blockBreakAny != null || blockPlaceAny != null || killAny != null
                    || playerKills != null || deaths != null || joins != null || firstJoin != null
                    || lastSeen != null || playtime != null || sessionPlaytime != null
                    || fishCaught != null || itemsCrafted != null;
        }

        public boolean tracksPlaytime() {
            return playtime != null || sessionPlaytime != null;
        }

        public static Rules parse(ConfigurationSection section, Logger logger) {
            if (section == null) {
                return new Rules(Map.of(), Map.of(), Map.of(),
                        null, null, null, null, null, null, null, null, null, null, null, null);
            }

            ConfigurationSection breaking = section.getConfigurationSection("blocks-broken");
            ConfigurationSection placing = section.getConfigurationSection("blocks-placed");
            ConfigurationSection killing = section.getConfigurationSection("kills");

            return new Rules(
                    materials(breaking, logger, "blocks-broken"),
                    materials(placing, logger, "blocks-placed"),
                    entities(killing, logger),
                    breaking == null ? null : id(breaking.getString("any")),
                    placing == null ? null : id(placing.getString("any")),
                    killing == null ? null : id(killing.getString("any")),
                    id(section.getString("player-kills")),
                    id(section.getString("deaths")),
                    id(section.getString("joins")),
                    id(section.getString("first-join")),
                    id(section.getString("last-seen")),
                    id(section.getString("playtime")),
                    id(section.getString("session-playtime")),
                    id(section.getString("fish-caught")),
                    id(section.getString("items-crafted")));
        }

        /**
         * Reads a material → statistic map.
         *
         * An unknown material is reported and skipped rather than failing the section. Material names
         * change between Minecraft versions, and a server upgrading should lose one mapping with a
         * clear warning rather than every mapping with none.
         */
        private static Map<Material, String> materials(
                ConfigurationSection section, Logger logger, String where) {
            Map<Material, String> mapped = new EnumMap<>(Material.class);
            ConfigurationSection body = section == null ? null : section.getConfigurationSection("materials");

            if (body == null) {
                return mapped;
            }

            for (String key : body.getKeys(false)) {
                Material material = Material.matchMaterial(key.trim().toUpperCase(Locale.ROOT));

                if (material == null) {
                    logger.warning("statistics.yml → record → " + where + " → materials: unknown "
                            + "material \"" + key + "\", ignored.");
                    continue;
                }

                String statisticId = id(body.getString(key));

                if (statisticId != null) {
                    mapped.put(material, statisticId);
                }
            }

            return mapped;
        }

        private static Map<EntityType, String> entities(ConfigurationSection section, Logger logger) {
            Map<EntityType, String> mapped = new EnumMap<>(EntityType.class);
            ConfigurationSection body = section == null ? null : section.getConfigurationSection("entities");

            if (body == null) {
                return mapped;
            }

            for (String key : body.getKeys(false)) {
                try {
                    String statisticId = id(body.getString(key));

                    if (statisticId != null) {
                        mapped.put(EntityType.valueOf(key.trim().toUpperCase(Locale.ROOT)), statisticId);
                    }
                } catch (IllegalArgumentException unknown) {
                    logger.warning("statistics.yml → record → kills → entities: unknown entity type \""
                            + key + "\", ignored.");
                }
            }

            return mapped;
        }

        /** Null for an absent or blank mapping, so every read site is one null check. */
        private static String id(String raw) {
            String normalised = org.robtic.minecraft.util.Ids.normalise(raw);
            return normalised.isBlank() ? null : normalised;
        }
    }
}
