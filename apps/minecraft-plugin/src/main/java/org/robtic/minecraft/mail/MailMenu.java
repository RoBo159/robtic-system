package org.robtic.minecraft.mail;

import net.kyori.adventure.inventory.Book;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.robtic.minecraft.config.MessageCatalog;
import org.robtic.minecraft.gui.Icons;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * The mailbox menu, and the book one mail opens as.
 *
 * <h2>Why a book and not more lore</h2>
 *
 * A mail can be several paragraphs — the reason a report was upheld, what a warning was for — and
 * item lore is a tooltip: it truncates awkwardly, cannot be scrolled, and vanishes the moment the
 * cursor moves. A written book is the one vanilla surface built for reading prose. It also opens
 * over the menu and closes back to the world, which is exactly the interaction a letter wants.
 *
 * The book is opened virtually, with {@link Player#openBook}. Nothing is ever placed in the player's
 * inventory, so there is no item to drop, duplicate, or leave behind when they log out mid-read.
 */
public final class MailMenu {

    /** Six rows: enough for the forty-five mails the API returns, with a row left for the footer. */
    private static final int SIZE = 54;
    private static final int FOOTER_SLOT = 49;
    private static final int MAX_ENTRIES = 45;

    /** Lines per page. Chosen to fit a book page without the client re-flowing them. */
    private static final int LINES_PER_PAGE = 13;

    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm").withZone(ZoneOffset.UTC);

    private final MessageCatalog messages;

    public MailMenu(MessageCatalog messages) {
        this.messages = messages;
    }

    /** The mailbox: one item per mail, newest first. */
    public void open(Player player, List<Mail> mails) {
        MailMenuHolder holder = new MailMenuHolder();
        Inventory inventory = Bukkit.createInventory(holder, SIZE,
                MessageCatalog.render(messages.text("mail.menu-title")));
        holder.attach(inventory);

        if (mails.isEmpty()) {
            inventory.setItem(22, Icons.of(Material.BARRIER,
                    messages.text("mail.empty-title"),
                    List.of(messages.text("mail.empty-hint"))));
            player.openInventory(inventory);
            return;
        }

        for (int index = 0; index < mails.size() && index < MAX_ENTRIES; index++) {
            Mail mail = mails.get(index);

            inventory.setItem(index, Icons.of(mail.icon(), title(mail), lore(mail)));
            holder.bind(index, mail);
        }

        int unread = (int) mails.stream().filter(mail -> !mail.read()).count();

        inventory.setItem(FOOTER_SLOT, Icons.of(Material.CHEST,
                messages.text("mail.footer-title"),
                List.of(
                        messages.text("mail.footer-total", "count", String.valueOf(mails.size())),
                        messages.text("mail.footer-unread", "count", String.valueOf(unread)))));

        player.openInventory(inventory);
    }

    /** Unread mail is coloured differently, so a full mailbox still shows what is new at a glance. */
    private String title(Mail mail) {
        return messages.text(mail.read() ? "mail.entry-read" : "mail.entry-unread", "subject", mail.subject());
    }

    private List<String> lore(Mail mail) {
        List<String> lore = new ArrayList<>();

        lore.add(messages.text("mail.entry-from", "sender", mail.senderName()));
        lore.add(messages.text("mail.entry-date", "date", date(mail.createdAt())));

        if (mail.important()) {
            lore.add(messages.text("mail.entry-important"));
        }

        lore.add("");

        // A short preview, so a mailbox can be skimmed without opening every book. The first
        // non-blank line is the one that says what happened; the rest is detail.
        mail.body().stream()
                .filter(line -> !line.isBlank())
                .findFirst()
                .ifPresent(preview -> lore.add(messages.text("mail.entry-preview", "text", trim(preview))));

        lore.add("");
        lore.add(messages.text("mail.entry-hint"));

        return lore;
    }

    /**
     * Opens one mail as a written book.
     *
     * The first page carries the subject and sender as a header, so a book left open on page one
     * still identifies itself.
     */
    public void openBook(Player player, Mail mail) {
        List<Component> pages = new ArrayList<>();
        List<String> lines = new ArrayList<>();

        lines.add(messages.text("mail.book-subject", "subject", mail.subject()));
        lines.add(messages.text("mail.book-from", "sender", mail.senderName()));
        lines.add(messages.text("mail.book-date", "date", date(mail.createdAt())));
        lines.add("");
        lines.addAll(mail.body());

        for (int start = 0; start < lines.size(); start += LINES_PER_PAGE) {
            List<String> page = lines.subList(start, Math.min(start + LINES_PER_PAGE, lines.size()));
            pages.add(MessageCatalog.render(String.join("\n", page)));
        }

        // An empty body would otherwise produce a book with no pages, which the client refuses to
        // open at all — leaving a click that appears to do nothing.
        if (pages.isEmpty()) {
            pages.add(MessageCatalog.render(messages.text("mail.book-empty")));
        }

        player.openBook(Book.book(
                MessageCatalog.render(mail.subject()),
                MessageCatalog.render(mail.senderName()),
                pages));
    }

    private static String trim(String text) {
        return text.length() <= 40 ? text : text.substring(0, 39) + "…";
    }

    /**
     * The timestamp, rendered.
     *
     * An unparseable value is shown as-is rather than dropped: whatever the API sent is more use to
     * somebody diagnosing it than a blank line, and this must never throw inside a menu build.
     */
    private static String date(String isoTimestamp) {
        if (isoTimestamp == null || isoTimestamp.isBlank()) {
            return "unknown";
        }

        try {
            return DATE.format(Instant.parse(isoTimestamp));
        } catch (DateTimeParseException unparseable) {
            return isoTimestamp;
        }
    }
}
