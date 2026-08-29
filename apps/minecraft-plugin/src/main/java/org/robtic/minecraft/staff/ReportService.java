package org.robtic.minecraft.staff;

import com.google.gson.JsonObject;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.robtic.minecraft.api.ApiException;
import org.robtic.minecraft.api.ApiGateway;
import org.robtic.minecraft.config.ApiSettings;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.config.StaffSettings;
import org.robtic.minecraft.model.Report;
import org.robtic.minecraft.util.Durations;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.logging.Level;

/**
 * The report lifecycle in game: filing it, showing it to staff, and settling it.
 *
 * <h2>A report is a ticket, not a live page</h2>
 *
 * Filing used to require both players to be standing there: the reported player was resolved with
 * {@code getPlayerExact}, and a report against somebody who had just logged off was refused. That
 * is precisely backwards — the player who has left is the one a report is most often about, and
 * refusing it teaches players not to bother.
 *
 * So a report names a player rather than pointing at one. The name is resolved to a UUID off the
 * main thread, from the online players, then this server's user cache, then the API; the reported
 * player's last known position is attached when there is one; and the report is filed whether or not
 * anybody is on duty. It reaches staff through the Discord channel the guild configured and through
 * the in-game queue, and it waits there.
 *
 * <h2>Accepting is settled by the API, never here</h2>
 *
 * Two staff members will click Accept within the same second, and accepting jails somebody. This
 * sends each decision and shows whatever the API decided — the atomic settle there is the only thing
 * that can resolve it, because two servers each holding their own memory would both believe they
 * won. It is also where the jail is written, so a sentence lands on a reported player who is offline
 * rather than silently doing nothing.
 */
public final class ReportService {

    private final Plugin plugin;
    private final ApiGateway gateway;
    private final ApiSettings api;
    private final StaffSettings staffSettings;
    private final MessageCatalog messages;
    private final StaffAvailabilityService availability;
    private final ReportChatService chat;
    private final JailService jail;
    private final LastSeenLocations lastSeen;

    public ReportService(
            Plugin plugin,
            ApiGateway gateway,
            ApiSettings api,
            StaffSettings staffSettings,
            MessageCatalog messages,
            StaffAvailabilityService availability,
            ReportChatService chat,
            JailService jail,
            LastSeenLocations lastSeen
    ) {
        this.plugin = plugin;
        this.gateway = gateway;
        this.api = api;
        this.staffSettings = staffSettings;
        this.messages = messages;
        this.availability = availability;
        this.chat = chat;
        this.jail = jail;
        this.lastSeen = lastSeen;
    }

    /** A reported player resolved to something the API can be given. */
    private record ResolvedTarget(UUID uuid, String username, boolean online, Location location) {
    }

    // ─── Filing ───────────────────────────────────────────────────────────────────────────────

    /**
     * Files a report against a player, online or not.
     *
     * Everything here happens off the main thread except the messages, because resolving a name that
     * belongs to nobody currently connected can mean a user-cache read or an API call.
     */
    public void file(Player reporter, String targetName, String reason) {
        Location reporterLocation = reporter.getLocation().clone();

        gateway.read(
                () -> {
                    ResolvedTarget target = resolve(targetName);

                    if (target == null) {
                        throw new ApiException("NOT_FOUND", 0, targetName);
                    }

                    if (target.uuid().equals(reporter.getUniqueId())) {
                        throw new ApiException("CONFLICT", 0, "self");
                    }

                    return gateway.client().post("/api/staff/reports", body(reporter, reporterLocation, target, reason),
                            ApiGateway.requestIdFor("report", reporter.getUniqueId(), System.currentTimeMillis()));
                },
                response -> {
                    Report filed = Report.fromJson(response);

                    for (Component line : messages.lines("report.submitted",
                            "player", filed.targetUsername(), "id", filed.code())) {
                        reporter.sendMessage(line);
                    }

                    announce(filed);
                },
                error -> {
                    if ("NOT_FOUND".equals(error.code())) {
                        reporter.sendMessage(messages.prefixed("report.unknown-player", "player", targetName));
                        return;
                    }

                    if ("CONFLICT".equals(error.code())) {
                        reporter.sendMessage(messages.prefixed("report.self"));
                        return;
                    }

                    plugin.getLogger().log(Level.FINE, "Report by " + reporter.getName() + " failed: " + error.code());
                    reporter.sendMessage(messages.prefixed("report.failed"));
                });
    }

    /**
     * Turns a typed name into a player the API can be told about.
     *
     * Three sources, cheapest first. Online is exact and free. The server's own user cache answers
     * for anybody who has played here before without a network call, and carries the last position
     * this server saw them at. The API answers for a linked player who has never joined *this*
     * server, which is what makes a report work across a network.
     *
     * Off the main thread only — the last two can block.
     *
     * @return null when the name belongs to nobody this server has ever heard of.
     */
    private ResolvedTarget resolve(String username) {
        Player online = Bukkit.getPlayerExact(username);

        if (online != null) {
            return new ResolvedTarget(online.getUniqueId(), online.getName(), true, online.getLocation().clone());
        }

        OfflinePlayer cached = Bukkit.getOfflinePlayerIfCached(username);

        if (cached != null) {
            return new ResolvedTarget(
                    cached.getUniqueId(),
                    cached.getName() == null ? username : cached.getName(),
                    false,
                    lastSeen.of(cached.getUniqueId()).orElse(null));
        }

        try {
            var profile = gateway.client().get("/api/minecraft/player", Map.of(
                    "guildId", api.guildId(),
                    "username", username
            ));

            if (profile.has("uuid") && !profile.get("uuid").isJsonNull()) {
                UUID uuid = UUID.fromString(profile.get("uuid").getAsString());
                return new ResolvedTarget(uuid, username, false, lastSeen.of(uuid).orElse(null));
            }
        } catch (ApiException unknown) {
            // Not an error worth surfacing: "the API has never heard of them either" is the same
            // answer as "no such player", and the caller renders one message for both.
            plugin.getLogger().log(Level.FINE, "Could not resolve \"" + username + "\" through the API", unknown);
        }

        return null;
    }

    private JsonObject body(Player reporter, Location reporterLocation, ResolvedTarget target, String reason) {
        JsonObject body = new JsonObject();

        body.addProperty("guildId", api.guildId());
        body.addProperty("targetUuid", target.uuid().toString());
        body.addProperty("targetUsername", target.username());
        body.addProperty("targetOnline", target.online());
        body.addProperty("authorUuid", reporter.getUniqueId().toString());
        body.addProperty("authorUsername", reporter.getName());
        body.addProperty("text", reason);
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        body.add("reporterLocation", position(reporterLocation));

        // Absent rather than null when there is none: an offline player this server has not seen
        // leave has no last position, and the API renders that honestly instead of showing 0, 0, 0.
        JsonObject targetPosition = position(target.location());
        if (targetPosition != null) {
            body.add("targetLocation", targetPosition);
        }

        return body;
    }

    private static JsonObject position(Location location) {
        if (location == null || location.getWorld() == null) {
            return null;
        }

        JsonObject json = new JsonObject();
        json.addProperty("world", location.getWorld().getName());
        json.addProperty("x", location.getX());
        json.addProperty("y", location.getY());
        json.addProperty("z", location.getZ());
        return json;
    }

    /**
     * Shows the interactive alert to everyone on duty.
     *
     * Only staff in staff mode receive it. Staff who are online but off duty deliberately get
     * nothing — see {@link StaffAvailabilityService}. Nobody being on duty is not a problem here the
     * way it used to be: the report is already filed and already in Discord, and it is waiting in
     * the reports menu for whoever comes on shift.
     */
    private void announce(Report report) {
        Component accept = MessageCatalog.render(messages.text("report.accept-button"))
                .clickEvent(ClickEvent.runCommand("/report accept " + report.code()))
                .hoverEvent(HoverEvent.showText(MessageCatalog.render(messages.text("report.accept-hover"))));

        Component refuse = MessageCatalog.render(messages.text("report.refuse-button"))
                .clickEvent(ClickEvent.runCommand("/report refuse " + report.code()))
                .hoverEvent(HoverEvent.showText(MessageCatalog.render(messages.text("report.refuse-hover"))));

        for (Player staff : availability.activeStaff()) {
            for (Component line : messages.lines("report.notification",
                    "id", report.code(),
                    "reporter", report.reporterUsername(),
                    "reported", report.targetUsername(),
                    "where", describe(report.targetLocation(), report.targetOnline()),
                    "reason", report.reason())) {
                staff.sendMessage(line);
            }

            staff.sendMessage(accept.append(MessageCatalog.render(" ")).append(refuse));
        }
    }

    /** A position for a chat line or a lore row, saying plainly when there is not one. */
    public String describe(Report.Position position, boolean online) {
        if (position == null) {
            return messages.text(online ? "report.location-unknown" : "report.location-offline");
        }

        return online
                ? position.describe()
                : messages.text("report.location-last-seen", "where", position.describe());
    }

    // ─── Reading ──────────────────────────────────────────────────────────────────────────────

    /** The open queue, for the staff reports menu. */
    public void openReports(Player staff, Consumer<List<Report>> onLoaded) {
        gateway.read(
                () -> Report.listFromJson(gateway.get("/api/staff/reports", Map.of(
                        "guildId", api.guildId(),
                        "status", "open"
                ))),
                onLoaded,
                error -> staff.sendMessage(messages.prefixed("report.list-failed")));
    }

    /** One report by its six-digit code, for `/report accept` and the detail view. */
    public void byCode(Player staff, String code, Consumer<Report> onLoaded) {
        gateway.read(
                () -> Report.fromJson(gateway.get("/api/staff/reports/by-code", Map.of(
                        "guildId", api.guildId(),
                        "code", code
                ))),
                onLoaded,
                error -> staff.sendMessage("NOT_FOUND".equals(error.code())
                        ? messages.prefixed("report.unknown-id", "id", code)
                        : messages.prefixed("report.list-failed")));
    }

    // ─── Settling ─────────────────────────────────────────────────────────────────────────────

    /**
     * Accepts a report, which jails the reported player.
     *
     * @param durationText what the staff member typed — "2h", "perm", or null for the configured
     *                     default. Parsed here so a typo is refused before anybody is punished.
     */
    public void accept(Player staff, String code, String durationText) {
        if (durationText != null && !Durations.isValid(durationText)) {
            staff.sendMessage(messages.prefixed("jail.bad-duration", "input", durationText));
            return;
        }

        Long durationMillis = durationText == null ? null : Durations.parse(durationText);
        decide(staff, code, "accept", durationMillis);
    }

    public void refuse(Player staff, String code) {
        decide(staff, code, "refuse", null);
    }

    private void decide(Player staff, String code, String decision, Long jailDurationMillis) {
        if (!availability.isInStaffMode(staff.getUniqueId())) {
            staff.sendMessage(messages.prefixed("staff.not-in-staff-mode"));
            return;
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("reportId", code);
        body.addProperty("decision", decision);
        body.addProperty("staffUuid", staff.getUniqueId().toString());
        body.addProperty("staffUsername", staff.getName());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        // Sent explicitly as null for a permanent sentence: absent would mean "the field was not
        // supplied", and the API has to be able to tell a chosen "forever" from an omission.
        if (jailDurationMillis == null) {
            body.add("jailDurationMs", com.google.gson.JsonNull.INSTANCE);
        } else {
            body.addProperty("jailDurationMs", jailDurationMillis);
        }

        String requestId = ApiGateway.requestIdFor(decision, staff.getUniqueId(), System.nanoTime());
        body.addProperty("requestId", requestId);

        gateway.read(
                () -> gateway.client().post("/api/staff/reports/decide", body, requestId),
                outcome -> onDecided(staff, decision, outcome),
                error -> {
                    if ("NOT_FOUND".equals(error.code())) {
                        staff.sendMessage(messages.prefixed("report.unknown-id", "id", code));
                        return;
                    }
                    // CONFLICT is the ordinary answer for everybody who lost the race, so it carries
                    // the API's own sentence rather than a generic failure line.
                    staff.sendMessage("CONFLICT".equals(error.code())
                            ? MessageCatalog.render("&c" + error.getMessage())
                            : messages.prefixed("report.decide-failed"));
                });
    }

    /**
     * Applies what the API decided. Main thread.
     *
     * The sentence itself is already written — this mirrors it onto the reported player if they
     * happen to be connected here, so they are moved into the jail now rather than the next time
     * they join. A player who is offline, or on another server, is picked up by that server's own
     * join handler.
     */
    private void onDecided(Player staff, String decision, JsonObject outcome) {
        Report report = outcome.has("report") && outcome.get("report").isJsonObject()
                ? Report.fromJson(outcome.getAsJsonObject("report"))
                : null;

        if (report == null) {
            plugin.getLogger().warning("The API settled a report but returned no report body.");
            staff.sendMessage(messages.prefixed("report.decide-failed"));
            return;
        }

        boolean jailed = outcome.has("jailed") && outcome.get("jailed").getAsBoolean();

        if (!"accept".equals(decision)) {
            staff.sendMessage(messages.prefixed("report.refused", "id", report.code(),
                    "player", report.targetUsername()));
            closeSession(report);
            return;
        }

        staff.sendMessage(messages.prefixed(
                jailed ? "report.accepted" : "report.accepted-already-jailed",
                "id", report.code(),
                "player", report.targetUsername()));

        if (jailed && report.targetUuid() != null) {
            jail.applyRemoteState(report.targetUuid(), true, report.reason());
        }

        closeSession(report);
    }

    /** Ends the private conversation a claim opened, now that the report has been settled. */
    private void closeSession(Report report) {
        chat.close(report.id(), messages.prefixed("report.session-ended"));
    }

    // ─── Claiming and the private conversation ────────────────────────────────────────────────

    /**
     * Claims a report, opening a private conversation with the reporter.
     *
     * Kept alongside accepting rather than merged into it: claiming says "I am looking at this",
     * which is what a staff member does *before* deciding whether it deserves a jail. Merging the
     * two would mean every report a staff member opened was also upheld.
     */
    public void claim(Player staff, String reportId) {
        if (!availability.isInStaffMode(staff.getUniqueId())) {
            staff.sendMessage(messages.prefixed("staff.not-in-staff-mode"));
            return;
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("reportId", reportId);
        body.addProperty("staffUuid", staff.getUniqueId().toString());
        body.addProperty("staffUsername", staff.getName());
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        String requestId = ApiGateway.requestIdFor("claim", staff.getUniqueId(), System.nanoTime());
        body.addProperty("requestId", requestId);

        gateway.read(
                () -> gateway.client().post("/api/staff/reports/claim", body, requestId),
                claimed -> onClaimed(staff, Report.fromJson(claimed)),
                error -> staff.sendMessage("CONFLICT".equals(error.code())
                        ? MessageCatalog.render("&c" + error.getMessage())
                        : messages.prefixed("report.claim-failed")));
    }

    /** Main thread: it teleports and opens a chat session. */
    private void onClaimed(Player staff, Report report) {
        staff.sendMessage(messages.prefixed("report.claimed",
                "id", report.code(), "reporter", report.reporterUsername()));

        Player reporter = report.reporterUuid() == null ? null : Bukkit.getPlayer(report.reporterUuid());

        if (reporter == null || !reporter.isOnline()) {
            staff.sendMessage(messages.prefixed("report.reporter-offline"));
            return;
        }

        if (staffSettings.teleportOnReportAccept()) {
            staff.teleport(reporter.getLocation());
            staff.sendMessage(messages.prefixed("report.teleported", "player", reporter.getName()));
        }

        chat.open(report.id(), reporter, staff);
    }

    // ─── Closing a conversation ───────────────────────────────────────────────────────────────

    /** `/report close` and `/report dismiss` — ends the session and closes the case. */
    public void close(Player staff, String status, String note) {
        Optional<String> reportId = chat.reportIdFor(staff.getUniqueId());

        if (reportId.isEmpty()) {
            staff.sendMessage(messages.prefixed("report.no-active-session"));
            return;
        }

        JsonObject body = new JsonObject();
        body.addProperty("guildId", api.guildId());
        body.addProperty("reportId", reportId.get());
        body.addProperty("staffUuid", staff.getUniqueId().toString());
        body.addProperty("staffUsername", staff.getName());
        body.addProperty("status", status);
        if (note != null && !note.isBlank()) {
            body.addProperty("note", note);
        }
        body.addProperty("serverId", api.serverId());
        body.addProperty("serverName", api.serverName());

        String requestId = ApiGateway.requestIdFor("close", staff.getUniqueId(), System.nanoTime());
        body.addProperty("requestId", requestId);

        gateway.read(
                () -> gateway.client().post("/api/staff/reports/close", body, requestId),
                closed -> {
                    chat.close(reportId.get(), messages.prefixed("report.session-ended"));
                    staff.sendMessage(messages.prefixed(
                            "resolved".equals(status) ? "report.resolved" : "report.dismissed"));
                },
                error -> {
                    plugin.getLogger().log(Level.FINE, "Could not close report " + reportId.get() + ": " + error.code());
                    staff.sendMessage(messages.prefixed("report.close-failed"));
                });
    }
}
