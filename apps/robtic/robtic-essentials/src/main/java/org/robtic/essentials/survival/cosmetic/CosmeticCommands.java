package org.robtic.essentials.survival.cosmetic;

import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.robtic.core.api.ApiGateway;
import org.robtic.core.config.MessageCatalog;
import org.robtic.core.entitlement.Entitlements;
import org.robtic.essentials.survival.SurvivalCacheService;
import org.robtic.essentials.survival.gui.ParticleMenu;

import java.util.Locale;

/**
 * `/particle` and `/joinmessage` — the premium cosmetics.
 *
 * <h2>Clearing a value is an explicit null</h2>
 *
 * `/particle off` and `/joinmessage reset` send JSON null rather than omitting the field. The API
 * distinguishes the two: an absent key means "leave this alone", a null means "unset it". Omitting
 * the field would silently do nothing, which is the sort of bug that looks like the command was
 * ignored.
 */
public final class CosmeticCommands implements CommandExecutor {

    /** Keeps a join message from being used to spam a wall of text at everyone on connect. */
    private static final int MAX_MESSAGE_LENGTH = 100;

    private final ApiGateway gateway;
    private final MessageCatalog messages;
    private final SurvivalCacheService cache;
    private final ParticleMenu menu;

    public CosmeticCommands(
            ApiGateway gateway,
            MessageCatalog messages,
            SurvivalCacheService cache,
            ParticleMenu menu
    ) {
        this.gateway = gateway;
        this.messages = messages;
        this.cache = cache;
        this.menu = menu;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("That command can only be run by a player.");
            return true;
        }

        Entitlements premium = cache.cachedPremium(player.getUniqueId());
        if (!premium.cosmetics()) {
            player.sendMessage(messages.prefixed("survival.premium-only"));
            return true;
        }

        switch (command.getName().toLowerCase()) {
            case "particle" -> particle(player, args);
            case "joinmessage" -> joinMessage(player, args);
            case "leavemessage" -> leaveMessage(player, args);
            default -> {
                return false;
            }
        }

        return true;
    }

    private void particle(Player player, String[] args) {
        if (args.length == 0) {
            menu.open(player, cache.cachedSettings(player.getUniqueId()).particle());
            return;
        }

        String choice = args[0].toUpperCase(Locale.ROOT);

        if (choice.equals("OFF") || choice.equals("NONE")) {
            apply(player, "particle", JsonNull.INSTANCE, "survival.particle-off");
            return;
        }

        if (ParticleService.resolve(choice).isEmpty() || !ParticleService.AVAILABLE.contains(choice)) {
            player.sendMessage(messages.prefixed("survival.particle-unknown", "name", args[0]));
            return;
        }

        select(player, choice);
    }

    /** Shared with the menu, so clicking an icon and typing the name take the same path. */
    public void select(Player player, String particle) {
        JsonObject value = new JsonObject();
        value.addProperty("particle", particle);
        apply(player, value, "survival.particle-set", "name", particle);
    }

    public void clearParticle(Player player) {
        apply(player, "particle", JsonNull.INSTANCE, "survival.particle-off");
    }

    private void joinMessage(Player player, String[] args) {
        message(player, args, "joinMessage", "survival.joinmessage-set", "survival.joinmessage-reset");
    }

    private void leaveMessage(Player player, String[] args) {
        message(player, args, "leaveMessage", "survival.leavemessage-set", "survival.leavemessage-reset");
    }

    private void message(Player player, String[] args, String field, String setKey, String resetKey) {
        if (args.length == 0) {
            player.sendMessage(messages.prefixed("survival.message-usage"));
            return;
        }

        if (args[0].equalsIgnoreCase("reset") || args[0].equalsIgnoreCase("off")) {
            apply(player, field, JsonNull.INSTANCE, resetKey);
            return;
        }

        String text = String.join(" ", args).trim();

        if (text.length() > MAX_MESSAGE_LENGTH) {
            player.sendMessage(messages.prefixed("survival.message-too-long", "max", String.valueOf(MAX_MESSAGE_LENGTH)));
            return;
        }

        JsonObject value = new JsonObject();
        value.addProperty(field, text);
        apply(player, value, setKey, "message", text);
    }

    private void apply(Player player, String field, JsonNull cleared, String successKey) {
        JsonObject value = new JsonObject();
        value.add(field, cleared);
        apply(player, value, successKey);
    }

    private void apply(Player player, JsonObject changes, String successKey, Object... placeholders) {
        gateway.read(
                () -> cache.updateSettings(player.getUniqueId(), changes),
                updated -> player.sendMessage(messages.prefixed(successKey, placeholders)),
                error -> player.sendMessage("FORBIDDEN".equals(error.code())
                        ? messages.prefixed("survival.premium-only")
                        : messages.prefixed("survival.unavailable")));
    }
}
