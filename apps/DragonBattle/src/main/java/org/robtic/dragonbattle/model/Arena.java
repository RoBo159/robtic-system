package org.robtic.dragonbattle.model;

import org.robtic.dragonbattle.region.BuildTracker;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * One configurable dragon fight: where everything is, and what the fight is allowed to do.
 *
 * <h2>Mutable, and deliberately so</h2>
 *
 * Every other value type here is a record, because a position does not change once written. An arena
 * is the opposite: it is built up interactively by an operator standing in the world running
 * `/dragonbattle perch add` a dozen times, and rebuilding the whole aggregate for each edit would
 * make the command layer harder to read for no benefit. What it does <em>not</em> expose is its
 * collections — {@link #perches()} and friends hand back copies, so nothing outside can mutate an
 * arena without going through a method that can also mark it dirty.
 *
 * <h2>The crystal count is the ritual requirement</h2>
 *
 * There is no configured "how many crystals are needed": the answer is however many positions the
 * operator defined. That is what removes the vanilla limit of four without introducing a second
 * number that could disagree with the first.
 */
public final class Arena {

    private final String name;
    private boolean enabled;

    private StoredLocation dragonSpawn;
    private StoredLocation playerSpawn;
    private StoredLocation portalCentre;
    private StoredLocation beacon;

    private final List<StoredLocation> crystals = new ArrayList<>();
    private final List<StoredLocation> gateways = new ArrayList<>();
    private final Map<String, Perch> perches = new LinkedHashMap<>();
    /**
     * The cuboid the fight happens in.
     *
     * Replaces the safe and breakable regions entirely. Those asked an operator to describe what the
     * dragon must not touch, which is the larger and more error-prone half of the problem — one
     * forgotten region meant a destroyed build. The arena instead bounds where the dragon may *be*,
     * and what it may break is decided by who placed each block. See {@link BuildTracker}.
     */
    private Region bounds;

    /** Where the dragon egg sits during the ritual and after the fight. */
    private StoredLocation egg;

    /** Which blocks inside {@link #bounds} players put there, and the dragon may therefore break. */
    private final BuildTracker builds = new BuildTracker();

    private ArenaSettings settings;

    public Arena(String name, ArenaSettings settings) {
        this.name = name;
        this.settings = settings;
        this.enabled = false;
    }

    public String name() {
        return name;
    }

    public boolean enabled() {
        return enabled;
    }

    public void enabled(boolean value) {
        this.enabled = value;
    }

    public ArenaSettings settings() {
        return settings;
    }

    public void settings(ArenaSettings replacement) {
        this.settings = replacement;
    }

    // ─── Positions ────────────────────────────────────────────────────────────────────────────

    public Optional<StoredLocation> dragonSpawn() {
        return Optional.ofNullable(dragonSpawn);
    }

    public void dragonSpawn(StoredLocation location) {
        this.dragonSpawn = location;
    }

    public Optional<StoredLocation> playerSpawn() {
        return Optional.ofNullable(playerSpawn);
    }

    public void playerSpawn(StoredLocation location) {
        this.playerSpawn = location;
    }

    public Optional<StoredLocation> portalCentre() {
        return Optional.ofNullable(portalCentre);
    }

    public void portalCentre(StoredLocation location) {
        this.portalCentre = location;
    }

    public Optional<StoredLocation> beacon() {
        return Optional.ofNullable(beacon);
    }

    public void beacon(StoredLocation location) {
        this.beacon = location;
    }

    // ─── Crystals ─────────────────────────────────────────────────────────────────────────────

    public List<StoredLocation> crystals() {
        return List.copyOf(crystals);
    }

    public void addCrystal(StoredLocation location) {
        crystals.add(location);
    }

    /** Removes by index, as `/dragonbattle crystal list` numbers them. */
    public boolean removeCrystal(int index) {
        if (index < 0 || index >= crystals.size()) {
            return false;
        }
        crystals.remove(index);
        return true;
    }

    /** How many crystals must be placed for the ritual to begin. */
    public int requiredCrystals() {
        return crystals.size();
    }

    // ─── Gateways ─────────────────────────────────────────────────────────────────────────────

    public List<StoredLocation> gateways() {
        return List.copyOf(gateways);
    }

    public void addGateway(StoredLocation location) {
        gateways.add(location);
    }

    public boolean removeGateway(int index) {
        if (index < 0 || index >= gateways.size()) {
            return false;
        }
        gateways.remove(index);
        return true;
    }

    // ─── Perches ──────────────────────────────────────────────────────────────────────────────

    public List<Perch> perches() {
        return List.copyOf(perches.values());
    }

    public void addPerch(Perch perch) {
        perches.put(perch.id(), perch);
    }

    public boolean removePerch(String id) {
        return perches.remove(id) != null;
    }

    public Optional<Perch> perch(String id) {
        return Optional.ofNullable(perches.get(id));
    }

    // ─── The arena cuboid ─────────────────────────────────────────────────────────────────────

    public Optional<Region> bounds() {
        return Optional.ofNullable(bounds);
    }

    /**
     * Sets the arena's bounds.
     *
     * The build record is cleared with them: the positions it holds describe blocks inside the old
     * cuboid, and keeping them would leave the dragon believing it may break things in a space that
     * is no longer part of the arena.
     */
    public void bounds(Region region) {
        this.bounds = region;
        this.builds.clear();
    }

    public BuildTracker builds() {
        return builds;
    }

    /** Whether a position is inside the arena. False when no bounds are configured. */
    public boolean inside(org.bukkit.Location location) {
        return bounds != null && bounds.contains(location);
    }

    /**
     * Whether a location is over the arena, at any height.
     *
     * This is the test that applies to the dragon. See {@link Region#containsHorizontally} for why
     * asking about its Y is asking the wrong question.
     */
    public boolean over(org.bukkit.Location location) {
        return bounds != null && bounds.containsHorizontally(location);
    }

    // ─── Dragon egg ───────────────────────────────────────────────────────────────────────────

    public Optional<StoredLocation> egg() {
        return Optional.ofNullable(egg);
    }

    public void egg(StoredLocation location) {
        this.egg = location;
    }

    // ─── Readiness ────────────────────────────────────────────────────────────────────────────

    /**
     * Why this arena cannot host a battle, or empty when it can.
     *
     * Returned as a list of reasons rather than a boolean because the operator asking is mid-setup
     * and wants to know what is still missing — "not ready" on its own sends them hunting.
     */
    public List<String> readinessProblems() {
        List<String> problems = new ArrayList<>();

        if (dragonSpawn == null) {
            problems.add("no dragon spawn (/dragonbattle setspawn)");
        }
        if (crystals.isEmpty()) {
            problems.add("no crystal positions (/dragonbattle crystal add)");
        }
        if (portalCentre == null && settings.generatePortal()) {
            problems.add("no portal centre (/dragonbattle portal set)");
        }
        if (bounds == null) {
            // Required, not optional. Without bounds the dragon has nothing keeping it in the arena
            // and nothing telling the build tracker which blocks it governs — the fight would spill
            // into the surrounding world with no protection at all.
            problems.add("no arena area (/dragonbattle area pos1, then pos2)");
        } else if (dragonSpawn != null) {
            // The cuboid is the dragon's whole movement boundary, so a spawn outside it is a dragon
            // that is dragged back inside on its first tick. It would look like the fight starting
            // in the wrong place and then twitching, with nothing in the log to explain it — and the
            // fix is to move one of the two, which is only obvious if somebody says so.
            dragonSpawn.toBukkit()
                    .filter(location -> !bounds.contains(location))
                    .ifPresent(location -> problems.add(
                            "the dragon spawn is outside the arena area — move it inside, or reselect"
                                    + " the area to include it"));
        }

        // Perches are optional on purpose: an arena with none simply has a dragon that never lands,
        // which is a valid — if unusual — fight rather than a broken configuration.
        return problems;
    }

    public boolean ready() {
        return readinessProblems().isEmpty();
    }
}
