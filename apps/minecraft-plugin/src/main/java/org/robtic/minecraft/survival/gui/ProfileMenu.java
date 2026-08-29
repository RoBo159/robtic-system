package org.robtic.minecraft.survival.gui;

import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.robtic.minecraft.afk.AfkRewardService;
import org.robtic.minecraft.afk.AfkService;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.gui.Icons;
import org.robtic.minecraft.mail.MailService;
import org.robtic.minecraft.model.survival.SurvivalModels.AfkTotals;
import org.robtic.minecraft.model.survival.SurvivalModels.Home;
import org.robtic.minecraft.model.survival.SurvivalModels.Homes;
import org.robtic.minecraft.model.survival.SurvivalModels.Profile;
import org.robtic.minecraft.util.Durations;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * `/profile` — one player's public profile.
 *
 * <h2>Home coordinates: your own only, and in game only</h2>
 *
 * A player looking at their <em>own</em> profile sees where their homes are — it is their
 * information and it is useful to them. Looking at somebody <em>else's</em> profile shows only a
 * count, because a base location is exactly the thing that should not be handed to whoever asks.
 *
 * The coordinates are read from this server's local homes cache and are deliberately absent from
 * the profile the API returns. That is what makes the boundary structural rather than a rule
 * somebody has to remember: they are not in the DTO, so the Discord profile could not print them
 * even if a future change tried to.
 */
public final class ProfileMenu {

    private static final int SIZE = 45;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMM yyyy").withZone(ZoneOffset.UTC);

    /** The mailbox button, on your own profile only. */
    public static final String MAIL_ACTION = "mail";

    private final MessageCatalog messages;
    private final MailService mail;
    private final AfkService afk;
    private final AfkRewardService afkRewards;

    public ProfileMenu(MessageCatalog messages, MailService mail, AfkService afk, AfkRewardService afkRewards) {
        this.messages = messages;
        this.mail = mail;
        this.afk = afk;
        this.afkRewards = afkRewards;
    }

    /** Another player's profile: never carries home locations. */
    public void open(Player viewer, Profile profile) {
        open(viewer, profile, null);
    }

    /**
     * @param ownHomes the viewer's own homes, or null. Passed only when the viewer is looking at
     *                 themselves — the caller decides that, and passing somebody else's would be
     *                 the one way to leak a location.
     */
    public void open(Player viewer, Profile profile, Homes ownHomes) {
        SurvivalMenuHolder<String> holder = new SurvivalMenuHolder<>(SurvivalMenuHolder.View.PROFILE);
        Inventory inventory = Bukkit.createInventory(holder, SIZE,
                MessageCatalog.render(messages.text("survival.profile-title", "player", profile.username())));
        holder.attach(inventory);

        inventory.setItem(13, Icons.head(
                Bukkit.getOfflinePlayer(profile.uuid()),
                "&e" + profile.username(),
                headLore(profile)));

        inventory.setItem(20, Icons.of(Material.CLOCK, "&bPlaytime", List.of(
                "&f" + duration(profile.playtimeMs()),
                "&7First join: &f" + date(profile.firstJoinAt()),
                "&7Last seen: &f" + date(profile.lastSeenAt()))));

        inventory.setItem(21, Icons.of(Material.GOLD_INGOT, "&6Robs", List.of(
                "&f" + profile.robs() + " robs")));

        inventory.setItem(22, Icons.of(Material.IRON_SWORD, "&cCombat", List.of(
                "&7Kills: &f" + profile.kills(),
                "&7Deaths: &f" + profile.deaths(),
                "&7K/D: &f" + ratio(profile.kills(), profile.deaths()))));

        // Own homes are shown with their locations; anybody else's are a count and nothing more.
        boolean ownProfile = viewer.getUniqueId().equals(profile.uuid());
        inventory.setItem(23, Icons.of(Material.RED_BED, "&aHomes",
                homeLore(profile, ownProfile ? ownHomes : null)));

        inventory.setItem(24, Icons.of(Material.PLAYER_HEAD, "&dFriends", List.of(
                "&f" + profile.friendCount() + " friends")));

        inventory.setItem(31, Icons.of(
                profile.jailed() ? Material.IRON_BARS : Material.LIME_DYE,
                profile.jailed() ? "&cJailed" : "&aNot jailed",
                jailLore(profile)));

        if (afk.settings().showProfileStatistics()) {
            inventory.setItem(29, Icons.of(Material.CLOCK,
                    messages.text("afk.profile-title"), afkLore(profile)));
        }

        // Your own profile only. Somebody else's mail is not information their profile is entitled
        // to expose, and there is no slot to click on a profile that is not yours.
        if (ownProfile) {
            int unread = mail.unreadCount(viewer.getUniqueId());

            inventory.setItem(33, Icons.of(
                    unread > 0 ? Material.WRITTEN_BOOK : Material.BOOK,
                    messages.text("mail.profile-button"),
                    List.of(
                            messages.text(unread > 0 ? "mail.profile-unread" : "mail.profile-none",
                                    "count", String.valueOf(unread)),
                            "",
                            messages.text("mail.profile-hint"))));

            holder.bind(33, MAIL_ACTION);
        }

        viewer.openInventory(inventory);
    }

    private static List<String> headLore(Profile profile) {
        List<String> lore = new ArrayList<>();

        lore.add(profile.online() ? "&aOnline" : "&7Offline");
        lore.add("&7Rank: &f" + (profile.rankName() == null ? "Player" : profile.rankName()));
        lore.add("&7Premium: &f" + (profile.premium().isPremium() ? profile.premium().tierName() : "None"));
        lore.add("&7Discord: &f" + (profile.linked() ? "Linked" : "Not linked"));

        if (!profile.linked()) {
            lore.add("");
            lore.add("&8Run /link to connect Discord");
        }

        return lore;
    }

    /**
     * The homes row.
     *
     * With `homes` supplied — which only happens for a player's own profile — each one is listed
     * with its world and block coordinates. Without it, the count and the reason the rest is
     * missing, stated outright so nobody assumes the menu is broken.
     */
    private static List<String> homeLore(Profile profile, Homes homes) {
        List<String> lore = new ArrayList<>();
        lore.add("&f" + profile.homesUsed() + "&7/&f" + profile.homeLimit());

        if (homes == null) {
            lore.add("");
            lore.add("&8Locations are private");
            return lore;
        }

        if (homes.homes().isEmpty()) {
            lore.add("");
            lore.add("&8Set one with /sethome");
            return lore;
        }

        lore.add("");
        for (Home home : homes.homes()) {
            lore.add("&e" + home.name() + " &8• &7" + home.location().world()
                    + " &f" + Math.round(home.location().x())
                    + "&7, &f" + Math.round(home.location().y())
                    + "&7, &f" + Math.round(home.location().z()));
        }

        lore.add("");
        lore.add("&8Only you can see this.");
        return lore;
    }

    /**
     * The AFK panel.
     *
     * <h2>Two sources, deliberately</h2>
     *
     * The lifetime and daily totals come from the profile the API returned, so they are right for
     * anybody — including a player who is offline or on another server. The status and the running
     * session come from this server's own memory, because a session that has not ended has never
     * been written anywhere and asking the API for it would return the state before it began.
     *
     * A player who is not AFK — or who is AFK on some other server, which this one cannot see — has
     * a current session of zero. That is a real answer and is shown as "0m" rather than hidden,
     * because a panel that omits a row when its value is zero reads as a panel that failed to load.
     */
    private List<String> afkLore(Profile profile) {
        AfkTotals totals = profile.afk();

        boolean isAfk = afk.isAfk(profile.uuid());
        long session = afk.sessionMillis(profile.uuid());

        List<String> lore = new ArrayList<>();

        lore.add(messages.text("afk.profile-status",
                "status", messages.text(isAfk ? "afk.profile-status-yes" : "afk.profile-status-no")));
        lore.add(messages.text("afk.profile-session", "time", Durations.compact(session)));
        lore.add("");
        lore.add(messages.text("afk.profile-today", "time", Durations.compact(totals.todayOrZero())));
        lore.add(messages.text("afk.profile-total", "time", Durations.compact(totals.totalMillis())));
        lore.add(messages.text("afk.profile-robs", "robs", org.robtic.minecraft.util.Robs.format(totals.robs())));

        // What the session running right now is worth, which the lifetime figure will not include
        // until it ends. Shown only while it is actually accruing, so it reads as a live number
        // rather than as a second, contradictory total.
        if (isAfk) {
            lore.add("");
            lore.add(messages.text("afk.profile-earning",
                    "robs", org.robtic.minecraft.util.Robs.format(afkRewards.projectedRobs(session))));
        }

        return lore;
    }

    private static List<String> jailLore(Profile profile) {
        List<String> lore = new ArrayList<>();

        if (profile.jailed()) {
            lore.add("&7Remaining: &f" + (profile.jailRemainingMs() == null
                    ? "permanent"
                    : duration(profile.jailRemainingMs())));
        }

        lore.add("&7Times jailed: &f" + profile.jailCount());
        return lore;
    }

    /**
     * "12h 30m", or "0m" rather than an empty string for a player who has just arrived.
     *
     * Delegated rather than kept here: the AFK panel above and the placeholders both render the same
     * kind of accumulated span, and three copies of this arithmetic would eventually disagree about
     * whether a day is shown.
     */
    private static String duration(long millis) {
        return Durations.compact(millis);
    }

    private static String date(Long epochMillis) {
        return epochMillis == null ? "unknown" : DATE.format(Instant.ofEpochMilli(epochMillis));
    }

    /** Deaths of zero would divide by zero; the kill count is the honest answer there. */
    private static String ratio(int kills, int deaths) {
        return deaths == 0 ? String.valueOf(kills) : String.format(java.util.Locale.US, "%.2f", (double) kills / deaths);
    }
}
