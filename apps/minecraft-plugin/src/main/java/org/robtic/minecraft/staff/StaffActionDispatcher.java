package org.robtic.minecraft.staff;

import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.gui.StaffMenuFactory;
import org.robtic.minecraft.service.StaffLogService;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;

/**
 * Maps the action ids in `items.yml` to behaviour.
 *
 * A registry rather than a switch: adding an action means registering one entry, and an id the
 * operator mistyped resolves to nothing and says so, instead of silently doing whatever the
 * default branch happened to do.
 */
public final class StaffActionDispatcher {

    private final Map<String, BiConsumer<Player, Player>> actions = new HashMap<>();
    private final MessageCatalog messages;
    private final StaffMenuFactory menus;
    private final FreezeService freeze;
    private final VanishService vanish;
    private final StaffModeService staffMode;
    private final StaffLogService log;

    /** Where each staff member was before their last teleport, for the "back" action. */
    private final Map<UUID, Location> previousLocations = new ConcurrentHashMap<>();
    private final Random random = new Random();

    /** Bound after construction; see the `reports_menu` registration for why. */
    private volatile ReportService reports;

    public StaffActionDispatcher(
            MessageCatalog messages,
            StaffMenuFactory menus,
            FreezeService freeze,
            VanishService vanish,
            StaffModeService staffMode,
            StaffLogService log
    ) {
        this.messages = messages;
        this.menus = menus;
        this.freeze = freeze;
        this.vanish = vanish;
        this.staffMode = staffMode;
        this.log = log;

        registerDefaults();
    }

    /**
     * @param target the player under the staff member's crosshair, or null when there is none.
     *               Actions that need one check for it themselves rather than being filtered here,
     *               so each can give its own message about what it wanted.
     */
    public void dispatch(String actionId, Player staff, Player target) {
        if (actionId == null || actionId.isBlank()) {
            return;
        }

        BiConsumer<Player, Player> action = actions.get(actionId);

        if (action == null) {
            staff.sendMessage(messages.prefixed("staff.unknown-action", "action", actionId));
            return;
        }

        action.accept(staff, target);
    }

    public void register(String id, BiConsumer<Player, Player> action) {
        actions.put(id, action);
    }

    /**
     * Supplies the report service the `reports_menu` action needs.
     *
     * A setter rather than a constructor argument because the dependency runs the other way at
     * construction time: the report service is built after the menus, which are built after this.
     * Until it is bound the action refuses politely instead of throwing, which is the behaviour an
     * operator gets if the staff system is disabled entirely.
     */
    public void bindReports(ReportService reports) {
        this.reports = reports;
    }

    public List<String> registeredActions() {
        return actions.keySet().stream().sorted().toList();
    }

    private void registerDefaults() {
        register("freeze_target", (staff, target) -> {
            if (target == null) {
                staff.sendMessage(messages.prefixed("staff.no-target"));
                return;
            }
            if (freeze.isFrozen(target.getUniqueId())) {
                freeze.unfreeze(staff, target);
            } else {
                freeze.freeze(staff, target, messages.text("freeze.default-reason"));
            }
        });

        register("player_list", (staff, target) -> menus.openPlayerList(staff));
        register("teleport_menu", (staff, target) -> menus.openTeleportMenu(staff));
        register("lobby_menu", (staff, target) -> menus.openLobbyMenu(staff));
        register("staff_menu", (staff, target) -> menus.openDashboard(staff));

        // Registered lazily via a setter rather than injected: the report service needs the jail
        // service, which needs the staff chat, which is built before the menus this dispatcher
        // holds. Binding it after construction breaks the cycle without making anything lazy that
        // does not have to be — see bindReports.
        register("reports_menu", (staff, target) -> {
            if (reports == null) {
                staff.sendMessage(messages.prefixed("report.list-failed"));
                return;
            }
            reports.openReports(staff, queue -> menus.openReports(staff, queue, reports));
        });

        register("inspect_target", (staff, target) -> {
            if (target == null) {
                staff.sendMessage(messages.prefixed("staff.no-target"));
                return;
            }
            menus.openInventoryInspection(staff, target);
            log.action("inventory_inspect").actor(staff.getUniqueId(), staff.getName())
                    .target(target.getUniqueId(), target.getName()).submit();
        });

        register("exit_staff_mode", (staff, target) -> staffMode.disable(staff, "command"));

        register("toggle_vanish", (staff, target) -> vanish.toggle(staff));

        register("toggle_flight", (staff, target) -> {
            staff.setAllowFlight(!staff.getAllowFlight());
            staff.setFlying(staff.getAllowFlight());
            staff.sendMessage(messages.prefixed(staff.getAllowFlight() ? "tools.flight-on" : "tools.flight-off"));
        });

        register("toggle_night_vision", (staff, target) -> {
            if (staff.hasPotionEffect(PotionEffectType.NIGHT_VISION)) {
                staff.removePotionEffect(PotionEffectType.NIGHT_VISION);
                staff.sendMessage(messages.prefixed("tools.night-vision-off"));
            } else {
                // Effectively permanent, refreshed rather than timed, so it does not expire
                // mid-investigation and leave a moderator blind in a cave.
                staff.addPotionEffect(new PotionEffect(PotionEffectType.NIGHT_VISION, Integer.MAX_VALUE, 0, false, false));
                staff.sendMessage(messages.prefixed("tools.night-vision-on"));
            }
        });

        register("toggle_spectator", (staff, target) -> {
            boolean spectating = staff.getGameMode() == GameMode.SPECTATOR;
            staff.setGameMode(spectating ? GameMode.CREATIVE : GameMode.SPECTATOR);
            staff.sendMessage(messages.prefixed(spectating ? "tools.spectator-off" : "tools.spectator-on"));
        });

        register("toggle_speed", (staff, target) -> {
            float current = staff.getWalkSpeed();
            float next = current > 0.2f ? 0.2f : 0.5f;
            staff.setWalkSpeed(next);
            staff.setFlySpeed(next);
            staff.sendMessage(messages.prefixed("tools.speed", "speed", String.valueOf(next)));
        });

        register("random_teleport", (staff, target) -> {
            List<? extends Player> online = org.bukkit.Bukkit.getOnlinePlayers().stream()
                    .filter(candidate -> !candidate.equals(staff))
                    .toList();

            if (online.isEmpty()) {
                staff.sendMessage(messages.prefixed("tools.nobody-online"));
                return;
            }

            Player destination = online.get(random.nextInt(online.size()));
            rememberAndTeleport(staff, destination.getLocation());
            staff.sendMessage(messages.prefixed("tools.teleported", "player", destination.getName()));
        });

        register("teleport_back", (staff, target) -> {
            Location previous = previousLocations.remove(staff.getUniqueId());
            if (previous == null) {
                staff.sendMessage(messages.prefixed("tools.no-previous-location"));
                return;
            }
            staff.teleport(previous);
            staff.sendMessage(messages.prefixed("tools.teleported-back"));
        });
    }

    /** Records where the staff member was, so "back" has somewhere to return to. */
    public void rememberAndTeleport(Player staff, Location destination) {
        previousLocations.put(staff.getUniqueId(), staff.getLocation());
        staff.teleport(destination);
    }

    public void forget(UUID uuid) {
        previousLocations.remove(uuid);
    }
}
