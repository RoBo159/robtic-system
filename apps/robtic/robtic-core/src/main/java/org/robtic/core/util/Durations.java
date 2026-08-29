package org.robtic.core.util;

/**
 * Duration parsing and rendering, matching `formatDuration`/`parseDuration` in libs/sdk so a jail
 * described as "2h 30m" in chat reads identically in the Discord audit embed.
 */
public final class Durations {

    private Durations() {
    }

    /**
     * A span at the coarsest useful precision: "3d 4h", "2h 30m", or "45m".
     *
     * Distinct from {@link #format} on purpose. That one describes a *sentence*, where seconds
     * matter near the end of one and "Permanent" is a real answer. This describes accumulated time —
     * playtime, an AFK session, a daily total — where nobody reads the seconds and zero is an
     * ordinary value that must still render as something. Hence "0m" rather than an empty string:
     * a player who has not been AFK today has a figure, and it is zero.
     */
    public static String compact(long millis) {
        long total = Math.max(0L, millis);

        long days = total / 86_400_000L;
        long hours = (total / 3_600_000L) % 24;
        long minutes = (total / 60_000L) % 60;

        if (days > 0) {
            return days + "d " + hours + "h";
        }
        if (hours > 0) {
            return hours + "h " + minutes + "m";
        }
        return minutes + "m";
    }

    /** Renders a span, or "Permanent" for an indefinite sentence. */
    public static String format(Long millis) {
        if (millis == null) {
            return "Permanent";
        }
        if (millis < 1000) {
            return "0s";
        }

        long remaining = millis;
        StringBuilder builder = new StringBuilder();
        int parts = 0;

        long[] sizes = {86_400_000L, 3_600_000L, 60_000L, 1000L};
        String[] labels = {"d", "h", "m", "s"};

        for (int index = 0; index < sizes.length && parts < 2; index++) {
            long value = remaining / sizes[index];
            if (value <= 0) {
                continue;
            }
            if (parts > 0) {
                builder.append(' ');
            }
            builder.append(value).append(labels[index]);
            remaining -= value * sizes[index];
            parts++;
        }

        return builder.toString();
    }

    /**
     * Parses the syntax moderators type: `30m`, `2h`, `7d`, `1h30m`.
     *
     * Returns null for a permanent sentence, which the caller must distinguish from the parse
     * failure signalled by {@link #isValid}.
     */
    public static Long parse(String input) {
        String text = input.trim().toLowerCase();

        if (text.equals("perm") || text.equals("permanent") || text.equals("forever")) {
            return null;
        }

        long total = 0;
        long number = 0;
        boolean sawDigit = false;

        for (char character : text.toCharArray()) {
            if (Character.isDigit(character)) {
                number = number * 10 + (character - '0');
                sawDigit = true;
                continue;
            }

            long size = switch (character) {
                case 'd' -> 86_400_000L;
                case 'h' -> 3_600_000L;
                case 'm' -> 60_000L;
                case 's' -> 1000L;
                default -> 0L;
            };

            if (size > 0 && sawDigit) {
                total += number * size;
                number = 0;
                sawDigit = false;
            }
        }

        return total > 0 ? total : null;
    }

    /** True when the text is either a valid span or the literal permanent keyword. */
    public static boolean isValid(String input) {
        String text = input.trim().toLowerCase();
        if (text.equals("perm") || text.equals("permanent") || text.equals("forever")) {
            return true;
        }
        return parse(input) != null;
    }
}
