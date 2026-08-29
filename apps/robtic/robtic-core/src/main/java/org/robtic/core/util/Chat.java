package org.robtic.core.util;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;

/** Turns the legacy `&`-coded strings used in config.yml into Adventure components. */
public final class Chat {

    private static final LegacyComponentSerializer SERIALIZER = LegacyComponentSerializer.legacyAmpersand();

    private Chat() {
    }

    public static Component component(String legacy) {
        return SERIALIZER.deserialize(legacy);
    }

    /** Component from a prefixed message, so every plugin message reads consistently. */
    public static Component prefixed(String prefix, String legacy) {
        return SERIALIZER.deserialize(prefix + legacy);
    }
}
