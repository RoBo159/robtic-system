/**
 * What a shortcut cleans up once it has run.
 *
 * `both` suits channel-utility shortcuts — after `!lock` there is nothing worth keeping, and
 * leaving the trigger behind just makes the channel look like a command log. `none` suits
 * moderation actions, where the record of who ran what is the point. `output` is for shortcuts
 * whose reply is noise but whose invocation should stay visible.
 */
export const SHORTCUT_DELETE_MODES = ["both", "output", "none"] as const;

export type ShortcutDeleteMode = typeof SHORTCUT_DELETE_MODES[number];

export const SHORTCUT_DELETE_MODE_LABELS: Record<ShortcutDeleteMode, string> = {
    both: "Delete the trigger message and the reply",
    output: "Delete only the reply",
    none: "Keep both messages",
};

/** Compact form for `/shortcut list`. */
export const SHORTCUT_DELETE_MODE_SHORT: Record<ShortcutDeleteMode, string> = {
    both: "🧹 trigger + reply",
    output: "🧽 reply only",
    none: "📌 nothing",
};

/** How long a deletable shortcut message stays visible before it is removed. */
export const SHORTCUT_REPLY_LIFETIME_MS = 3_000;

export function isShortcutDeleteMode(value: string): value is ShortcutDeleteMode {
    return (SHORTCUT_DELETE_MODES as readonly string[]).includes(value);
}
