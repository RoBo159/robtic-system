package org.robtic.essentials.afk;

import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;

import java.util.UUID;

/**
 * Where a player was, and how they were, before AFK moved them.
 *
 * Stored as plain values rather than as a {@link Location}: a Location holds a live World reference,
 * which pins an unloaded world in memory and is meaningless once the server has dropped it. Keeping
 * the world's name means the reference is resolved at restore time, when we can check whether it is
 * still there and refuse gracefully if not.
 *
 * <h2>This is also the AFK session</h2>
 *
 * {@link #enteredAt} is the session's start, and it is a wall-clock timestamp rather than a tick
 * count — ticks stop when the server lags and would quietly under-pay a player for time they really
 * spent. Everything the session is worth is derived from it, so nothing here has to be kept up to
 * date while a player stands still: the reward at any moment is a function of
 * {@code now - enteredAt}, and no timer, no counter and no periodic write is involved.
 *
 * @param worldName the world the player was in; resolved on restore, not held
 * @param inVehicle whether they were riding something when AFK took them, which the restore uses to
 *                  decide whether being placed on foot is a change worth mentioning
 * @param settledAt when the session was paid out, or 0 while it is still accruing. See
 *                  {@link #settle}.
 */
public record AfkSnapshot(
        UUID uuid,
        String worldName,
        double x,
        double y,
        double z,
        float yaw,
        float pitch,
        GameMode gameMode,
        boolean flying,
        boolean allowFlight,
        boolean inVehicle,
        long enteredAt,
        long settledAt
) {

    /** Captures a player's current position and movement state. Main thread only. */
    public static AfkSnapshot capture(Player player) {
        Location where = player.getLocation();
        return new AfkSnapshot(
                player.getUniqueId(),
                where.getWorld().getName(),
                where.getX(),
                where.getY(),
                where.getZ(),
                where.getYaw(),
                where.getPitch(),
                player.getGameMode(),
                player.isFlying(),
                player.getAllowFlight(),
                player.isInsideVehicle(),
                System.currentTimeMillis(),
                0L
        );
    }

    /**
     * The same snapshot, with the session marked paid.
     *
     * The location outlives the session on purpose. A player who disconnects while AFK is paid
     * immediately — there is no later chance — but they are still standing in the AFK world, and the
     * snapshot is the only record of where they actually were. It therefore survives the payout and
     * is honoured when they next join; this flag is what stops that restore paying a second time for
     * the same minutes.
     */
    public AfkSnapshot settle(long at) {
        return new AfkSnapshot(uuid, worldName, x, y, z, yaw, pitch,
                gameMode, flying, allowFlight, inVehicle, enteredAt, at);
    }

    /** True once this session has been paid out and must not be paid again. */
    public boolean isSettled() {
        return settledAt > 0L;
    }

    /**
     * The location to put the player back at, or null when its world is gone.
     *
     * Null is a real answer, not a failure to compute one: a world can be unloaded while someone
     * stands AFK in the lobby, and teleporting into a world that no longer exists is not something
     * the caller should be left to discover.
     */
    public Location location() {
        World world = Bukkit.getWorld(worldName);
        return world == null ? null : new Location(world, x, y, z, yaw, pitch);
    }

    /**
     * How long this session has run: {@code current time - start time}, always.
     *
     * A settled session is frozen at the moment it was paid, so a snapshot kept for its location
     * after a disconnect does not keep growing while the player is offline — which would otherwise
     * pay them for the night on their next join.
     */
    public long afkMillis() {
        return Math.max(0L, (isSettled() ? settledAt : System.currentTimeMillis()) - enteredAt);
    }

    void write(ConfigurationSection section) {
        section.set("world", worldName);
        section.set("x", x);
        section.set("y", y);
        section.set("z", z);
        section.set("yaw", yaw);
        section.set("pitch", pitch);
        section.set("game-mode", gameMode.name());
        section.set("flying", flying);
        section.set("allow-flight", allowFlight);
        section.set("in-vehicle", inVehicle);
        section.set("entered-at", enteredAt);
        section.set("settled-at", settledAt);
    }

    static AfkSnapshot read(UUID uuid, ConfigurationSection section) {
        GameMode mode;
        try {
            mode = GameMode.valueOf(section.getString("game-mode", "SURVIVAL"));
        } catch (IllegalArgumentException unknown) {
            mode = GameMode.SURVIVAL;
        }

        long entered = section.getLong("entered-at", System.currentTimeMillis());

        return new AfkSnapshot(
                uuid,
                section.getString("world", ""),
                section.getDouble("x"),
                section.getDouble("y"),
                section.getDouble("z"),
                (float) section.getDouble("yaw"),
                (float) section.getDouble("pitch"),
                mode,
                section.getBoolean("flying"),
                section.getBoolean("allow-flight"),
                section.getBoolean("in-vehicle"),
                entered,
                // Anything read back from disk is a location to honour, never a session to pay.
                //
                // A clean shutdown settles every live session before saving, so the only entries
                // that reach here still marked live are the ones a crash left behind — and their
                // start time is from before the outage. Honouring it would pay the player for every
                // hour the server was down, which is both wrong and unbounded. Sealing them at
                // their own start instead makes the unpaid tail of a crashed session worth nothing,
                // which is the conservative direction and the only one that cannot invent robs.
                Math.max(section.getLong("settled-at", 0L), entered)
        );
    }

    /** True when this snapshot names a world that no longer exists. */
    public boolean isStale() {
        return worldName == null || worldName.isBlank() || Bukkit.getWorld(worldName) == null;
    }

    static YamlConfiguration emptyDocument() {
        return new YamlConfiguration();
    }
}
