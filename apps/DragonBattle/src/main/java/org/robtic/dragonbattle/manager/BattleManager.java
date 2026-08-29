package org.robtic.dragonbattle.manager;

import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.EnderDragon;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.dragonbattle.battle.BattleContext;
import org.robtic.dragonbattle.battle.BattleState;
import org.robtic.dragonbattle.battle.DragonBossBar;
import org.robtic.dragonbattle.config.MessageCatalog;
import org.robtic.dragonbattle.config.PluginSettings;
import org.robtic.dragonbattle.dragon.DragonController;
import org.robtic.dragonbattle.dragon.ArenaFlight;
import org.robtic.dragonbattle.dragon.GroundCombat;
import org.robtic.dragonbattle.events.BattleStateChangeEvent;
import org.robtic.dragonbattle.model.Arena;
import org.robtic.dragonbattle.model.Perch;
import org.robtic.dragonbattle.model.Region;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Runs the battles: one state machine per arena, advanced by the ticker.
 *
 * <h2>Why the states are a machine rather than a chain of callbacks</h2>
 *
 * The vanilla fight is a sequence of things that happen after other things — crystals, then a
 * respawn, then a dragon, then a portal, then gateways. Written as nested callbacks that is a
 * structure nothing can inspect, pause or resume, and inserting a boss phase means editing every
 * stage around it. Written as states, each stage answers one question — "am I finished?" — and the
 * machine does the sequencing.
 *
 * <h2>One battle per arena, at most</h2>
 *
 * Keyed by arena name. Two battles in one arena would fight over the same dragon and the same
 * portal, so starting a second is refused rather than queued.
 */
public final class BattleManager {

    private final Plugin plugin;
    private final PluginSettings settings;
    private final GroundCombat combat;

    /** Enforces the arena cuboid against the dragon's own navigation. See {@link ArenaFlight}. */
    private volatile ArenaFlight flight;

    /** Past this distance from the arena centre, steering the dragon home is slower than a teleport. */
    private static final double FAR_OUTSIDE = 120.0;

    /** Arena name → its running battle. Absence means the arena is idle. */
    private final Map<String, BattleContext> battles = new ConcurrentHashMap<>();

    private final MessageCatalog messages;

    /** Crystals heal the dragon, which is vanilla's loop and not inherited — see CrystalHealing. */
    private volatile org.robtic.dragonbattle.dragon.CrystalHealing healing;

    public BattleManager(Plugin plugin, PluginSettings settings, MessageCatalog messages) {
        this.plugin = plugin;
        this.settings = settings;
        this.combat = new GroundCombat(settings.groundCombat());
        this.messages = messages;
        this.healing = settings.crystalHealing();
        this.flight = settings.arenaFlight();
    }

    /** Rebuilt on reload, so edited healing values apply without a restart. */
    public void healing(org.robtic.dragonbattle.dragon.CrystalHealing replacement) {
        this.healing = replacement;
    }

    /** Rebuilt on reload, so edited flight margins apply without a restart. */
    public void flight(ArenaFlight replacement) {
        if (replacement != null) {
            this.flight = replacement;
        }
    }

    /**
     * Logs a decision the fight made, when debug is on.
     *
     * The questions an operator actually asks are "why did it not land?" and "why is it stuck in
     * that state?", so those are what this reports. Off by default because it is one line every few
     * seconds per battle.
     */
    private void debug(BattleContext context, String message) {
        if (settings.debug()) {
            plugin.getLogger().info("[" + context.arena().name() + "] " + message);
        }
    }

    public Optional<BattleContext> battle(Arena arena) {
        return Optional.ofNullable(battles.get(key(arena)));
    }

    public boolean isRunning(Arena arena) {
        return battles.containsKey(key(arena));
    }

    /** Every battle currently in progress, for the ticker to advance. */
    public List<BattleContext> running() {
        return List.copyOf(battles.values());
    }

    /**
     * Begins a battle.
     *
     * @return the reason it could not start, or empty on success. A string rather than an exception
     *         because every caller is a command that has to tell somebody why.
     */
    public Optional<String> start(Arena arena, long now) {
        if (!arena.enabled()) {
            return Optional.of("that arena is disabled");
        }

        if (isRunning(arena)) {
            return Optional.of("a battle is already running there");
        }

        List<String> problems = arena.readinessProblems();
        if (!problems.isEmpty()) {
            return Optional.of("the arena is incomplete: " + String.join(", ", problems));
        }

        BattleContext context = new BattleContext(arena, now, new DragonBossBar(messages));
        battles.put(key(arena), context);

        // Straight past WAITING: an operator starting a battle by hand has said the ritual is done,
        // and making them place crystals afterwards would be a second, contradictory instruction.
        transition(context, BattleState.RESPAWN_ANIMATION, now);

        return Optional.empty();
    }

    /** Ends a battle and removes anything it created that should not outlive it. */
    public void stop(Arena arena, boolean killDragon) {
        BattleContext context = battles.remove(key(arena));

        if (context == null) {
            return;
        }

        if (killDragon) {
            context.dragon().ifPresent(org.bukkit.entity.Entity::remove);
        }

        context.reset(now());
    }

    // ─── The machine ──────────────────────────────────────────────────────────────────────────

    /**
     * Advances one battle by one tick.
     *
     * Every state answers the same question in its own way — has what I was waiting for happened? —
     * and the machine moves on when it says yes. Nothing here knows what any other state does.
     */
    public void tick(BattleContext context, long now) {
        switch (context.state()) {
            case WAITING, COMPLETED -> {
                // Driven by players placing crystals, or by an operator resetting. Nothing to do.
            }

            case CRYSTALS_PLACED -> transition(context, BattleState.RESPAWN_ANIMATION, now);

            case RESPAWN_ANIMATION -> {
                long elapsed = context.ticksInState(now);
                long duration = settings.spawnAnimationTicks();

                // The bar fills as the countdown runs, so it is the timer rather than decoration.
                context.bossBar().awakeningProgress((float) elapsed / duration);

                if (elapsed >= duration) {
                    transition(context, BattleState.DRAGON_SPAWN, now);
                }
            }

            case DRAGON_SPAWN -> spawnDragon(context, now);

            case ACTIVE_FIGHT -> fight(context, now);

            case LANDING -> landing(context, now);

            case TAKEOFF -> {
                context.controller(settings.dragonFlight()).ifPresent(controller ->
                        homeOf(context.arena()).ifPresent(controller::circle));

                context.currentPerch(null);
                transition(context, BattleState.ACTIVE_FIGHT, now);
            }

            case DRAGON_DEATH -> {
                // The vanilla death animation runs about ten seconds; the portal should not appear
                // underneath a dragon that is still visibly dying.
                if (context.ticksInState(now) >= 200L) {
                    transition(context, BattleState.PORTAL_OPENING, now);
                }
            }

            // The three closing stages are handed to their services by the plugin, which listens for
            // the state change. Keeping the block generation out of the machine is what lets an
            // operator disable the portal without the sequence noticing.
            case PORTAL_OPENING -> transition(context, BattleState.BEACON_SPAWN, now);
            case BEACON_SPAWN -> transition(context, BattleState.GATEWAY_OPENING, now);
            case GATEWAY_OPENING -> transition(context, BattleState.COMPLETED, now);
        }
    }

    private void spawnDragon(BattleContext context, long now) {
        Optional<Location> spawn = context.arena().dragonSpawn().flatMap(location -> location.toBukkit());

        if (spawn.isEmpty()) {
            plugin.getLogger().warning("Arena \"" + context.arena().name()
                    + "\" has a dragon spawn in a world that is not loaded — the battle cannot continue.");
            stop(context.arena(), false);
            return;
        }

        World world = spawn.get().getWorld();
        EnderDragon dragon = (EnderDragon) world.spawnEntity(spawn.get(), EntityType.ENDER_DRAGON);

        context.dragon(dragon);
        context.bossBar().showFight(dragon, playersIn(world, context.arena()));

        DragonController controller = context.controller(settings.dragonFlight()).orElse(null);

        if (controller == null) {
            plugin.getLogger().warning("Arena \"" + context.arena().name()
                    + "\" spawned a dragon that immediately stopped existing — the battle cannot continue.");
            stop(context.arena(), false);
            return;
        }

        // Movement authority is taken here, before the dragon has ticked even once. From this point
        // vanilla's flight AI is off and every position the dragon occupies is one this plugin chose
        // — which is what makes an arena at any altitude work. See FlightController.
        controller.assumeControl();

        // The podium is what the dragon circles and returns to when it has nothing else to do.
        //
        // It used to be the arena's portal centre, which is usually on the floor — so the dragon
        // hugged the ground when it was not attacking, and in an arena with no portal configured it
        // kept vanilla's, which is the End's own exit portal in another world entirely. That is one
        // half of "the dragon keeps trying to return to the vanilla portal height".
        //
        // The middle of the arena's own volume gives it the whole cuboid to use, and is a place that
        // exists in every arena by definition. The portal is still where it dies; see DragonListener.
        Location home = homeOf(context.arena())
                .or(() -> context.arena().portalCentre().flatMap(location -> location.toBlockCentre()))
                .orElse(spawn.get());

        controller.podium(home);
        controller.circle(home);

        transition(context, BattleState.ACTIVE_FIGHT, now);
    }

    /** The flying phase: attack, and occasionally consider coming down. */
    private void fight(BattleContext context, long now) {
        Optional<EnderDragon> dragon = context.dragon();

        if (dragon.isEmpty()) {
            // The dragon is gone without a death event — removed by a command, or its chunk went
            // away. Treated as the fight ending rather than as a battle stuck forever.
            transition(context, BattleState.DRAGON_DEATH, now);
            return;
        }

        Optional<DragonController> found = context.controller(settings.dragonFlight());

        if (found.isEmpty()) {
            transition(context, BattleState.DRAGON_DEATH, now);
            return;
        }

        DragonController controller = found.get();

        // Healing before the bar updates, so the bar shows the health players are actually fighting
        // against rather than the value from before the crystals topped it up.
        healing.tick(dragon.get(), context.arena());

        context.bossBar().update(dragon.get());

        // The flight step, every tick. This is what actually moves the dragon — see
        // FlightController — and it runs before anything below can change the pattern, so a pattern
        // chosen this tick starts flying on the next one rather than being stepped twice.
        boolean patternFinished = controller.tickFlight(now);

        confine(context, dragon.get(), controller);

        List<Player> players = playersIn(dragon.get().getWorld(), context.arena());

        // A dive that has completed its pass, or a strafe whose target logged out. Back to circling,
        // rather than holding position where the attack ended.
        if (patternFinished) {
            homeOf(context.arena()).ifPresent(controller::circle);
        }

        if (!context.shouldConsiderLanding(now)) {
            // Throttled: re-rolling the attack every tick cancelled each one before it moved. See
            // BattleContext#shouldPickAirAttack.
            if (!players.isEmpty() && context.shouldPickAirAttack(now)) {
                context.scheduleNextAirAttack(now);
                controller.attackFromAir(players.get((int) (now % players.size())));
            }
            return;
        }

        context.scheduleNextLandingCheck(now);

        if (Math.random() >= context.arena().settings().landingChance()) {
            return;
        }

        Optional<Perch> perch = context.perchSelector().select(context.arena(), players, now);

        // No eligible perch means the dragon keeps flying. It never falls back to landing on
        // whatever happens to be beneath it — that is the rule the whole landing system exists for.
        if (perch.isEmpty()) {
            debug(context, "wanted to land but no perch was eligible — "
                    + context.arena().perches().size() + " configured, all on cooldown, zero-weight, "
                    + "or out of range of a player");
            return;
        }

        // A perch outside the cuboid would have the dragon fly out to reach it and be clamped back in
        // on the same tick — an approach that can never finish, and a fight that stops landing at
        // all. Refused with a named reason instead, because the fix is to move the perch or the
        // arena and neither is guessable from silence.
        Optional<Location> destination = perch.get().location().toBlockCentre();

        if (destination.isPresent() && context.arena().bounds().isPresent()
                && !flight.allows(destination.get(), context.arena().bounds().get())) {

            debug(context, "perch \"" + perch.get().id() + "\" is outside the arena cuboid — skipped");
            return;
        }

        if (controller.flyTo(perch.get())) {
            context.currentPerch(perch.get());
            context.perchSelector().markUsed(perch.get(), now);
            debug(context, "landing on perch \"" + perch.get().id() + "\"");
            transition(context, BattleState.LANDING, now);
        } else {
            debug(context, "perch \"" + perch.get().id() + "\" is in a world that is not loaded");
        }
    }

    /** Flying to a perch, sitting on it, and deciding when to leave. */
    private void landing(BattleContext context, long now) {
        Optional<EnderDragon> dragon = context.dragon();
        Optional<Perch> perch = context.currentPerch();

        if (dragon.isEmpty() || perch.isEmpty()) {
            transition(context, BattleState.TAKEOFF, now);
            return;
        }

        Optional<DragonController> found = context.controller(settings.dragonFlight());
        Optional<Location> target = perch.get().location().toBlockCentre();

        if (found.isEmpty() || target.isEmpty()) {
            transition(context, BattleState.TAKEOFF, now);
            return;
        }

        DragonController controller = found.get();

        // The approach is a flight pattern like any other, flown by this plugin. The perch's Y is
        // used exactly as configured — a perch at y=20 is descended to, which vanilla's own approach
        // phase would not do because it navigates by a node ring at roughly y=80.
        boolean arrived = controller.tickFlight(now);

        if (!context.arrivedAtPerch()) {
            if (arrived) {
                context.arrivedAtPerch(true);
                controller.perch(target.get());

                // The stay timer starts on arrival, not on departure, so a distant perch is not
                // worth less time than a near one.
                context.resetStateClock(now);
            } else if (context.ticksInState(now) > APPROACH_TIMEOUT_TICKS) {
                // Something is stopping the approach — an unloaded chunk, another plugin cancelling
                // the movement. Giving up returns the dragon to the fight rather than leaving it
                // stuck part-way there forever.
                debug(context, "gave up approaching perch \"" + perch.get().id() + "\"");
                transition(context, BattleState.TAKEOFF, now);
            }

            return;
        }

        controller.groundTick(playersIn(dragon.get().getWorld(), context.arena()), 0.15, combat);

        if (context.ticksInState(now) >= perch.get().stayTicks()) {
            homeOf(context.arena()).ifPresent(controller::takeOff);
            transition(context, BattleState.TAKEOFF, now);
        }
    }

    /** How long an approach may take before it is abandoned. 15 seconds. */
    private static final long APPROACH_TIMEOUT_TICKS = 300L;

    /** Called by the listener when the dragon dies, whoever killed it. */
    public void onDragonDeath(BattleContext context, long now) {
        // Movement authority is handed back first, and it has to be.
        //
        // The death sequence is vanilla's: the dragon rises, spins, emits beams and disintegrates
        // over about ten seconds, and every frame of that is the entity moving itself. Holding its
        // position through it — which is what this plugin does for the whole rest of the fight —
        // would pin a dying dragon in place and leave the animation looking broken at the one moment
        // players are watching it most closely.
        context.controller(settings.dragonFlight())
                .ifPresent(DragonController::releaseControl);

        // Removed as the dragon dies rather than when the battle completes: the bar tracks the
        // dragon's health, and one reading zero through the portal and gateway stages would be a
        // fight that looked unfinished for another ten seconds.
        context.bossBar().hide();

        transition(context, BattleState.DRAGON_DEATH, now);
    }

    /**
     * Whether a ritual may begin in this arena.
     *
     * False while a battle is running, which is what stops a second ritual completing while a dragon
     * is still alive — the two would share an arena, a portal and a boss bar.
     */
    public boolean ritualAllowed(Arena arena) {
        return arena.enabled() && !isRunning(arena);
    }

    /**
     * Moves a battle to a new state and announces it.
     *
     * The event is what everything outside this class hangs off — portal generation, beacons,
     * gateways, cinematics — so that the machine sequences the fight and knows nothing about what
     * each stage actually does.
     */
    public void transition(BattleContext context, BattleState next, long now) {
        BattleState previous = context.state();

        if (previous == next) {
            return;
        }

        context.transition(next, now);

        debug(context, previous + " → " + next);

        plugin.getServer().getPluginManager().callEvent(
                new BattleStateChangeEvent(context.arena(), context, previous, next));
    }

    /**
     * A last-resort check that the dragon is still in its arena.
     *
     * <h2>This is no longer how the arena is respected</h2>
     *
     * It used to be. When vanilla owned the dragon's movement, the only way to keep it in a low arena
     * was to clamp its position afterwards — vanilla steered towards a node ring at roughly y=80 and
     * this dragged it back down, every tick, forever.
     *
     * That is gone. The flight patterns are computed from the arena itself now: the circle is centred
     * on the arena's own middle, an approach goes to a perch inside it, and a dive is aimed at a
     * player who is in it. The dragon is inside the arena because everywhere it is asked to go is
     * inside the arena, which is a much better reason than being pushed back in.
     *
     * <h2>What is left, and why</h2>
     *
     * Something else can still move the dragon: a command, a portal, another plugin. This notices
     * that and puts it back. It does <em>not</em> touch a destination the fight chose — a plugin-issued
     * target is used exactly as given, Y included — and it never runs while a pattern this plugin is
     * flying could be responsible for where the dragon is.
     */
    private void confine(BattleContext context, EnderDragon dragon, DragonController controller) {
        Arena arena = context.arena();
        Optional<Region> bounds = arena.bounds();

        if (bounds.isEmpty()) {
            return;
        }

        if (controller.isApproaching() || controller.isPerched()) {
            return;
        }

        // Inside its arena, which is the overwhelmingly common case now that the fight chooses every
        // destination. One containment test and nothing else happens.
        if (flight.allows(dragon.getLocation(), bounds.get())) {
            return;
        }

        Optional<Location> home = homeOf(arena);

        if (home.isEmpty()) {
            return;
        }

        double distance = dragon.getLocation().getWorld() == home.get().getWorld()
                ? dragon.getLocation().distance(home.get())
                : Double.MAX_VALUE;

        // Flown back for a modest excursion, teleported for a big one. At the far distance the
        // dragon has been moved by something outside the fight and is no longer part of it, so
        // flying it home would take longer than players will wait.
        if (distance > FAR_OUTSIDE) {
            debug(context, "dragon strayed " + Math.round(distance) + " blocks outside — teleporting back");
            dragon.teleport(home.get());
            controller.podium(home.get());
            controller.circle(home.get());
            return;
        }

        debug(context, "dragon is outside the arena — flying it back");
        controller.circle(home.get());
    }

    /**
     * The middle of the arena's volume, which is what the dragon treats as home.
     *
     * The arena's own centre rather than the dragon's spawn point: a spawn is usually placed where an
     * operator wanted the dragon to appear, which is often at one end or near the floor. Circling
     * around it would leave most of the arena unused. See {@link ArenaFlight#homeFor}.
     */
    private Optional<Location> homeOf(Arena arena) {
        return arena.bounds().flatMap(bounds ->
                ArenaFlight.homeFor(plugin.getServer().getWorld(bounds.world()), bounds));
    }

    /**
     * Players the dragon may target.
     *
     * Anyone outside the arena is ignored, as the brief requires: a player standing beyond the
     * bounds is not in the fight, and a dragon that chased them would leave the arena to do it.
     */
    private List<Player> playersIn(World world) {
        return playersIn(world, null);
    }

    private List<Player> playersIn(World world, Arena arena) {
        List<Player> players = new ArrayList<>();

        for (Player player : world.getPlayers()) {
            // Spectators are not targets: a dragon that charged a moderator watching in spectator
            // would be attacking somebody it cannot hurt and ignoring the people fighting it.
            if (player.getGameMode() == org.bukkit.GameMode.SPECTATOR || player.isDead()) {
                continue;
            }

            if (arena != null && arena.bounds().isPresent() && !arena.inside(player.getLocation())) {
                continue;
            }

            players.add(player);
        }

        return players;
    }


    private long now() {
        return plugin.getServer().getCurrentTick();
    }

    private static String key(Arena arena) {
        return arena.name().toLowerCase(Locale.ROOT);
    }
}
