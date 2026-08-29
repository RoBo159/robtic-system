package org.robtic.auth;

import org.bukkit.Location;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.Cancellable;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerPortalEvent;
import org.bukkit.event.player.PlayerTeleportEvent;
import org.robtic.core.config.MessageCatalog;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Everything an unauthenticated player may not do.
 *
 * <h2>One listener, one guard</h2>
 *
 * Every handler is the same shape: is this player unauthenticated, is this restriction on, refuse.
 * Splitting them across several listeners would repeat that guard a dozen times and make it easy for
 * one of them to forget the authentication check and start cancelling events for everybody — by far
 * the worst failure available here. The lobby module makes the same call for the same reason.
 *
 * <h2>Priority</h2>
 *
 * LOWEST, so the refusal happens before any other plugin acts on the event. An unverified player's
 * block break must not reach a logging plugin, a region protector or an economy hook at all — not
 * even to be cancelled afterwards, because by then something may already have written a row.
 *
 * <h2>Movement is confinement, not paralysis</h2>
 *
 * Freezing a player in place produces a client that rubber-bands and looks broken, and it makes the
 * link world useless as the tutorial it is meant to be. So walking is allowed by default and what is
 * enforced instead is the boundary: an unauthenticated player cannot leave the world they were put
 * in. Operators who want them pinned can switch the `movement` restriction on.
 */
public final class AuthRestrictionListener implements Listener {

    /** How often one player may be told they must authenticate. Stops a walk into a wall spamming. */
    private static final long NOTICE_INTERVAL_MILLIS = 3_000L;

    private final AuthService auth;
    private final MessageCatalog messages;

    private final Map<UUID, Long> lastNotice = new ConcurrentHashMap<>();

    public AuthRestrictionListener(AuthService auth, MessageCatalog messages) {
        this.auth = auth;
        this.messages = messages;
    }

    // ─── Chat and commands ────────────────────────────────────────────────────────────────────

    /**
     * Chat, in both directions.
     *
     * The message is cancelled *and* the unauthenticated player is removed from every other message's
     * recipients, which is the half that is easy to miss: refusing to let them speak while still
     * showing them the server's conversation leaks it to somebody who has not proved who they are.
     */
    @SuppressWarnings("deprecation")
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        // `ignoreCancelled` matters here: AuthChatListener shares this priority, is registered
        // first, and cancels the line it captures as a password. Without this, that captured line
        // would also be met with "log in first" — telling a player who is logging in that they
        // cannot.
        if (!auth.settings().restricts("chat")) {
            return;
        }

        if (!auth.isAuthenticated(event.getPlayer().getUniqueId())) {
            event.setCancelled(true);
            notice(event.getPlayer());
            return;
        }

        // Asynchronous: the recipient set is a synchronised view, and removing while another
        // handler iterates it is exactly the concurrent modification Bukkit warns about.
        event.getRecipients().removeIf(recipient -> !auth.isAuthenticated(recipient.getUniqueId()));
    }

    /**
     * Commands, except the ones an unauthenticated player genuinely needs.
     *
     * The namespaced form is resolved to the plain label first, so `/minecraft:me` cannot be used to
     * slip past a list that only names `me` — the same hole the lobby's command filter closes.
     */
    @EventHandler(priority = EventPriority.LOWEST)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        Player player = event.getPlayer();

        if (auth.isAuthenticated(player.getUniqueId()) || !auth.settings().restricts("commands")) {
            return;
        }

        String label = event.getMessage().substring(1).split(" ")[0].toLowerCase(Locale.ROOT);

        int namespace = label.indexOf(':');
        if (namespace >= 0) {
            label = label.substring(namespace + 1);
        }

        if (auth.settings().commandAllowed(label)) {
            return;
        }

        event.setCancelled(true);
        notice(player);
    }

    // ─── Movement, worlds and teleports ───────────────────────────────────────────────────────

    /**
     * Confinement.
     *
     * Two separate rules share this handler because they are both about position. With the
     * `movement` restriction on, nothing but looking around is permitted. With it off — the default
     * — walking is fine but leaving the world is not, which is what keeps somebody in the link world
     * without freezing them in it.
     */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        Player player = event.getPlayer();

        if (auth.isAuthenticated(player.getUniqueId())) {
            return;
        }

        Location from = event.getFrom();
        Location to = event.getTo();

        // Rotation is never blocked. A player who cannot look around cannot read the signs the link
        // world exists to show them, and blocking it makes the client fight the server.
        if (from.getX() == to.getX() && from.getY() == to.getY() && from.getZ() == to.getZ()) {
            return;
        }

        if (auth.settings().restricts("movement")) {
            event.setTo(from);
            notice(player);
            return;
        }

        if (auth.settings().restricts("world-change") && !from.getWorld().equals(to.getWorld())) {
            event.setTo(from);
            notice(player);
        }
    }

    /**
     * Teleports.
     *
     * Allowed only when this plugin is the one doing it — putting them into the link world, and
     * putting them back once they are in. Every other cause, including another plugin's spawn
     * handler, is refused: a teleport out of the link world by something that does not know about
     * authentication would undo the confinement above without going through it.
     */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        Player player = event.getPlayer();

        if (auth.isAuthenticated(player.getUniqueId()) || !auth.settings().restricts("teleport")) {
            return;
        }

        if (event.getCause() == PlayerTeleportEvent.TeleportCause.PLUGIN) {
            return;
        }

        event.setCancelled(true);
        notice(player);
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onPortal(PlayerPortalEvent event) {
        deny(event, event.getPlayer(), "portal");
    }

    // ─── The world ────────────────────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        deny(event, event.getPlayer(), "block-break");
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        deny(event, event.getPlayer(), "block-place");
    }

    /** Doors, buttons, containers, and using any item. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        deny(event, event.getPlayer(), "interact");
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onInteractEntity(PlayerInteractEntityEvent event) {
        deny(event, event.getPlayer(), "entity-interact");
    }

    // ─── Inventory ────────────────────────────────────────────────────────────────────────────

    /**
     * Inventory access, refused outright.
     *
     * There is no exemption any more, and that is the point: authentication no longer happens inside
     * an inventory, so no inventory needs to be reachable by an unauthenticated player. The login
     * surfaces are a client dialog, a Bedrock form and a chat line — none of which is a container,
     * and none of which produces these events at all.
     */
    @EventHandler(priority = EventPriority.LOWEST)
    public void onInventoryClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        if (auth.isAuthenticated(player.getUniqueId()) || !auth.settings().restricts("inventory")) {
            return;
        }

        event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onInventoryDrag(InventoryDragEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }

        if (auth.isAuthenticated(player.getUniqueId()) || !auth.settings().restricts("inventory")) {
            return;
        }

        event.setCancelled(true);
    }

    /** Refuses to open a chest, a furnace, or even their own inventory. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onInventoryOpen(InventoryOpenEvent event) {
        if (!(event.getPlayer() instanceof Player player)) {
            return;
        }

        if (auth.isAuthenticated(player.getUniqueId()) || !auth.settings().restricts("inventory")) {
            return;
        }

        event.setCancelled(true);
        notice(player);
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        deny(event, event.getPlayer(), "item-drop");
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (event.getEntity() instanceof Player player) {
            denyQuietly(event, player, "item-pickup");
        }
    }

    // ─── Damage ───────────────────────────────────────────────────────────────────────────────

    /**
     * Damage, taken and dealt.
     *
     * Both directions, and the incoming half matters more than it looks: a player who cannot fight
     * back and cannot run is otherwise free food for anything that wanders past while they read the
     * login prompt.
     */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (event.getEntity() instanceof Player player) {
            denyQuietly(event, player, "damage");
        }
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onDamageByEntity(EntityDamageByEntityEvent event) {
        Entity damager = event.getDamager();

        if (damager instanceof Player attacker
                && !auth.isAuthenticated(attacker.getUniqueId())
                && auth.settings().restricts("damage")) {
            event.setCancelled(true);
            notice(attacker);
        }
    }

    // ─── Shared guards ────────────────────────────────────────────────────────────────────────

    /** The check every handler above delegates to, with a message. */
    private void deny(Cancellable event, Player player, String restriction) {
        if (auth.isAuthenticated(player.getUniqueId()) || !auth.settings().restricts(restriction)) {
            return;
        }

        event.setCancelled(true);
        notice(player);
    }

    /**
     * The same, without telling them.
     *
     * For events that fire repeatedly through no action of the player's — walking over a pile of
     * items, standing in a fire. Refusing those twenty times should not produce twenty lines, and
     * the rate limiter in {@link #notice} is not a good enough answer for something that is not a
     * refusal the player did anything to earn.
     */
    private void denyQuietly(Cancellable event, Player player, String restriction) {
        if (!auth.isAuthenticated(player.getUniqueId()) && auth.settings().restricts(restriction)) {
            event.setCancelled(true);
        }
    }

    /** Reminds the player why, at most once every few seconds. */
    private void notice(Player player) {
        long now = System.currentTimeMillis();
        Long last = lastNotice.get(player.getUniqueId());

        if (last != null && now - last < NOTICE_INTERVAL_MILLIS) {
            return;
        }

        lastNotice.put(player.getUniqueId(), now);

        player.sendMessage(auth.stateOf(player.getUniqueId()).map(AuthState::needsLink).orElse(false)
                ? messages.prefixed("auth.must-link")
                : messages.prefixed("auth.must-login"));
    }

    /** Drops a departed player's notice clock, so the map does not grow with the player list. */
    public void forget(UUID uuid) {
        lastNotice.remove(uuid);
    }
}
