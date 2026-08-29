package org.robtic.dragonbattle.battle;

import net.kyori.adventure.bossbar.BossBar;
import net.kyori.adventure.text.Component;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.EnderDragon;
import org.bukkit.entity.Player;
import org.robtic.dragonbattle.config.MessageCatalog;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * The health bar shown during a fight, and the countdown shown before one.
 *
 * <h2>This plugin's own bar, not the dragon's</h2>
 *
 * A vanilla dragon comes with a boss bar owned by the server's {@code DragonBattle} — the object this
 * plugin is required not to touch. Its title and progress are not ours to set, and it disappears on
 * the server's schedule rather than the fight's.
 *
 * So this is a separate bar the plugin owns outright. It can say "Dragon Awakening…" before the
 * dragon exists, which the vanilla one cannot, and it goes away exactly when the battle says so.
 *
 * <h2>Viewers are tracked, not recomputed</h2>
 *
 * Adventure attaches a bar per player, so somebody who logs out mid-fight keeps a reference unless
 * it is removed. The viewer set is what makes {@link #hide} able to detach from everyone rather than
 * from whoever happens to be online at that moment.
 */
public final class DragonBossBar {

    private final MessageCatalog messages;

    private BossBar bar;
    private final Set<UUID> viewers = new HashSet<>();

    public DragonBossBar(MessageCatalog messages) {
        this.messages = messages;
    }

    /**
     * Shows the pre-spawn bar.
     *
     * Empty progress rather than full: it fills as the countdown runs, so the bar itself is the
     * timer and players can see how long is left without a number.
     */
    public void showAwakening(Iterable<? extends Player> players) {
        replace(messages.component("bossbar.awakening"), 0f, BossBar.Color.PURPLE);
        show(players);
    }

    /** Advances the awakening bar. `progress` runs 0 to 1 across the spawn animation. */
    public void awakeningProgress(float progress) {
        if (bar != null) {
            bar.progress(Math.clamp(progress, 0f, 1f));
        }
    }

    /** Switches to the fight bar once the dragon exists. */
    public void showFight(EnderDragon dragon, Iterable<? extends Player> players) {
        replace(name(dragon), 1f, BossBar.Color.PINK);
        show(players);
        update(dragon);
    }

    /**
     * Refreshes health. Called from the battle tick, which already runs once a second.
     *
     * Progress is clamped because a dragon damaged past zero in the same tick it dies would
     * otherwise hand Adventure a negative value and throw.
     */
    public void update(EnderDragon dragon) {
        if (bar == null || dragon == null) {
            return;
        }

        double max = dragon.getAttribute(Attribute.MAX_HEALTH) != null
                ? dragon.getAttribute(Attribute.MAX_HEALTH).getValue()
                : 200.0;

        float progress = max <= 0 ? 0f : (float) Math.clamp(dragon.getHealth() / max, 0.0, 1.0);

        bar.progress(progress);
        bar.name(name(dragon));
    }

    /** Adds a player to the bar, for somebody who joined mid-fight. */
    public void addViewer(Player player) {
        if (bar != null && viewers.add(player.getUniqueId())) {
            player.showBossBar(bar);
        }
    }

    /**
     * Removes the bar from everyone.
     *
     * Called on death, reset, despawn and shutdown. Safe to call when nothing is showing, because
     * every one of those paths can happen twice — a dragon that dies during a reset, for instance.
     */
    public void hide() {
        if (bar == null) {
            return;
        }

        for (UUID uuid : viewers) {
            Player player = org.bukkit.Bukkit.getPlayer(uuid);
            if (player != null) {
                player.hideBossBar(bar);
            }
        }

        viewers.clear();
        bar = null;
    }

    public boolean visible() {
        return bar != null;
    }

    private void replace(Component title, float progress, BossBar.Color colour) {
        hide();
        bar = BossBar.bossBar(title, progress, colour, BossBar.Overlay.NOTCHED_10);
    }

    private void show(Iterable<? extends Player> players) {
        for (Player player : players) {
            if (viewers.add(player.getUniqueId())) {
                player.showBossBar(bar);
            }
        }
    }

    /** The bar's title: the dragon's name and its health, both from messages.yml. */
    private Component name(EnderDragon dragon) {
        double health = Math.max(0, dragon.getHealth());

        return messages.component("bossbar.fight",
                "name", dragon.customName() == null
                        ? messages.text("bossbar.default-name")
                        : net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer
                                .plainText().serialize(dragon.customName()),
                "health", String.valueOf((long) Math.ceil(health)));
    }
}
