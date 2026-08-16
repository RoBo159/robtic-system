import { Logger } from "@logger";

const CTX = "quests";

interface ThrottleState {
    render: () => Promise<void>;
    lastEditAt: number;
    timer: ReturnType<typeof setTimeout> | null;
    backoffMs: number;
}

const state = new Map<string, ThrottleState>();

/** Discord's Unknown Message. The only error that proves the message is really gone. */
export const UNKNOWN_MESSAGE = 10008;

/**
 * Coalesces edits of one message.
 *
 * Leading *and* trailing edge: the first change after a quiet spell lands immediately, and
 * everything during the following window collapses into one trailing edit. A thousand
 * contributions in fifteen seconds cost one API call, but the first one still feels live.
 *
 * The renderer is replaced on every call rather than queued, so a trailing edit always draws the
 * newest state instead of replaying stale ones.
 */
export function scheduleEdit(messageId: string, minIntervalMs: number, render: () => Promise<void>): void {
    const existing = state.get(messageId);

    if (existing) {
        existing.render = render;
        if (existing.timer) return;   // a trailing edit is already armed

        const wait = existing.lastEditAt + Math.max(minIntervalMs, existing.backoffMs) - Date.now();
        if (wait <= 0) {
            void run(messageId, existing);
            return;
        }

        existing.timer = setTimeout(() => {
            existing.timer = null;
            void run(messageId, existing);
        }, wait);
        return;
    }

    const fresh: ThrottleState = { render, lastEditAt: 0, timer: null, backoffMs: 0 };
    state.set(messageId, fresh);
    void run(messageId, fresh);
}

async function run(messageId: string, entry: ThrottleState): Promise<void> {
    entry.lastEditAt = Date.now();

    try {
        await entry.render();
        entry.backoffMs = 0;
    } catch (err) {
        const code = (err as { code?: number }).code;

        if (code === UNKNOWN_MESSAGE) {
            // Genuinely gone. The caller reposts and re-registers under a new id.
            state.delete(messageId);
            return;
        }

        if ((err as { status?: number }).status === 429) {
            entry.backoffMs = Math.min(5 * 60_000, Math.max(30_000, entry.backoffMs * 2));
            Logger.warn(`Rate limited editing ${messageId}; backing off ${entry.backoffMs}ms`, CTX);
            return;
        }

        // Anything else — a 500, a network blip — keeps the entry so the next change retries.
        Logger.warn(`Could not edit ${messageId}: ${err}`, CTX);
    }
}

/** Forces the next change to edit immediately, for milestones worth seeing at once. */
export function bypassThrottle(messageId: string, floorMs: number): void {
    const entry = state.get(messageId);
    if (!entry) return;
    entry.lastEditAt = Math.min(entry.lastEditAt, Date.now() - floorMs);
}

export function forgetThrottle(messageId: string): void {
    const entry = state.get(messageId);
    if (entry?.timer) clearTimeout(entry.timer);
    state.delete(messageId);
}
