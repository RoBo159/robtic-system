package org.robtic.minecraft.staff;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.robtic.minecraft.config.RoleSettings;
import org.robtic.minecraft.model.StaffRank;
import org.robtic.minecraft.service.PermissionSyncService;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Who is available to handle a report right now.
 *
 * <h2>Available means all three things</h2>
 *
 * Online, holding a staff rank, and inside `/admin`. A staff member who is connected but building
 * in survival is deliberately not available — the whole point of staff mode is that it marks when
 * somebody is *working*, and a report that pings them off duty is a report nobody answers.
 *
 * <h2>Answered from memory</h2>
 *
 * Staff mode membership is this server's own state, and rank comes from LuckPerms, which is also
 * local. So every question here is a memory read: no cache to invalidate, no request to make, and
 * an answer that is correct at the instant it is asked rather than as of the last refresh.
 *
 * That is why this is a service over the existing {@link StaffModeService} rather than a cache in
 * front of the API — the API could only ever tell us about other servers, and a report filed here
 * has to be handled by somebody here.
 */
public final class StaffAvailabilityService {

    private final StaffModeService staffMode;
    private final PermissionSyncService permissions;
    private final RoleSettings roles;

    public StaffAvailabilityService(
            StaffModeService staffMode,
            PermissionSyncService permissions,
            RoleSettings roles
    ) {
        this.staffMode = staffMode;
        this.permissions = permissions;
        this.roles = roles;
    }

    /** Every online player currently in staff mode. Safe on the tick. */
    public List<Player> activeStaff() {
        return staffMode.activeStaff().stream()
                .map(Bukkit::getPlayer)
                .filter(player -> player != null && player.isOnline())
                .toList();
    }

    /** Whether a report may be filed at all. */
    public boolean anyAvailable() {
        return !activeStaff().isEmpty();
    }

    public int activeCount() {
        return activeStaff().size();
    }

    /**
     * Online players holding a staff rank, whether or not they are in staff mode.
     *
     * Backs `%robtic_staff_online%`, which is a different question from availability — a server can
     * have five staff online and none of them on duty, and a panel that conflated the two would be
     * misleading in exactly the situation that matters.
     *
     * Reads the cached LuckPerms view so it never blocks the tick.
     */
    public int onlineStaffCount() {
        return (int) Bukkit.getOnlinePlayers().stream()
                .filter(player -> rankOf(player.getUniqueId()).isPresent())
                .count();
    }

    /**
     * The rank a player holds, from their LuckPerms groups.
     *
     * Uses the non-blocking view: a player whose groups LuckPerms has not loaded resolves to empty
     * rather than stalling the caller, which matters because the placeholders call this every pass.
     */
    public Optional<StaffRank> rankOf(UUID uuid) {
        return permissions.loadedGroupsOf(uuid)
                .map(roles::highestFor)
                .orElseGet(Optional::empty);
    }

    /** Whether a player holds any staff rank at all. */
    public boolean isStaff(UUID uuid) {
        return rankOf(uuid).isPresent();
    }

    public boolean isInStaffMode(UUID uuid) {
        return staffMode.isInStaffMode(uuid);
    }

    /** When this player entered staff mode, for the session-duration placeholder. */
    public Optional<Long> sessionStartedAt(UUID uuid) {
        return staffMode.sessionStartedAt(uuid);
    }

    /** The rank held while in staff mode, which is what the session recorded. */
    public Optional<StaffRank> activeRankOf(UUID uuid) {
        return staffMode.rankOf(uuid);
    }
}
