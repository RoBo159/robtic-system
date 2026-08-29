package org.robtic.minecraft.mail;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

/**
 * `/mail` — opens the mailbox.
 *
 * The player-head item in the lobby is the discoverable way in, and this is the one people who
 * already know the feature exists will type. Both land on the same menu.
 */
public final class MailCommand implements CommandExecutor {

    private final MailService mail;
    private final MailMenu menu;

    public MailCommand(MailService mail, MailMenu menu) {
        this.mail = mail;
        this.menu = menu;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Only a player has a mailbox.");
            return true;
        }

        open(player);
        return true;
    }

    /** Shared with the profile menu's mailbox button, so both paths behave identically. */
    public void open(Player player) {
        mail.mailbox(player, mails -> menu.open(player, mails));
    }
}
