package org.robtic.core.util;

import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;

import java.util.Locale;
import java.util.Optional;

/**
 * Parses the colour strings operators write in progression configs.
 *
 * Three spellings are accepted because operators already use all three elsewhere in this plugin's
 * files and would reasonably expect them to work here: a vanilla name ({@code LIGHT_PURPLE}), a hex
 * value ({@code #FF55FF}) and a legacy code ({@code &d}).
 *
 * Distinct from {@link org.robtic.core.util.Chat}, which turns a whole {@code &}-coded *string*
 * into a component. This resolves a single colour, which is what a rarity or a title tint is.
 */
public final class Colors {

    private Colors() {
    }

    /**
     * @return empty when the value is absent or unparseable, so the caller supplies its own default
     *         and can warn with the context this class does not have
     */
    public static Optional<TextColor> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }

        String value = raw.trim();

        if (value.startsWith("#")) {
            return Optional.ofNullable(TextColor.fromHexString(value));
        }

        // A legacy code such as "&d". Resolved through Adventure's own table rather than a private
        // map, so it agrees with how the rest of the plugin renders the same code.
        if (value.length() == 2 && (value.charAt(0) == '&' || value.charAt(0) == '§')) {
            return Optional.ofNullable(
                    net.kyori.adventure.text.format.TextColor.color(
                            legacy(value.charAt(1)).orElse(NamedTextColor.WHITE).value()));
        }

        return Optional.ofNullable(NamedTextColor.NAMES.value(value.toLowerCase(Locale.ROOT)));
    }

    private static Optional<NamedTextColor> legacy(char code) {
        return Optional.ofNullable(switch (Character.toLowerCase(code)) {
            case '0' -> NamedTextColor.BLACK;
            case '1' -> NamedTextColor.DARK_BLUE;
            case '2' -> NamedTextColor.DARK_GREEN;
            case '3' -> NamedTextColor.DARK_AQUA;
            case '4' -> NamedTextColor.DARK_RED;
            case '5' -> NamedTextColor.DARK_PURPLE;
            case '6' -> NamedTextColor.GOLD;
            case '7' -> NamedTextColor.GRAY;
            case '8' -> NamedTextColor.DARK_GRAY;
            case '9' -> NamedTextColor.BLUE;
            case 'a' -> NamedTextColor.GREEN;
            case 'b' -> NamedTextColor.AQUA;
            case 'c' -> NamedTextColor.RED;
            case 'd' -> NamedTextColor.LIGHT_PURPLE;
            case 'e' -> NamedTextColor.YELLOW;
            case 'f' -> NamedTextColor.WHITE;
            default -> null;
        });
    }

    /** The legacy {@code &} code closest to a colour, for places that still take a legacy string. */
    public static String toLegacy(TextColor color) {
        NamedTextColor nearest = NamedTextColor.nearestTo(color);

        for (char code : "0123456789abcdef".toCharArray()) {
            if (nearest.equals(legacy(code).orElse(null))) {
                return "&" + code;
            }
        }

        return "&f";
    }
}
