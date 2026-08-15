import { flushActivity, trackedActivityCount } from "@core/activity";
import { ACTIVITY_FLUSH_INTERVAL_MS } from "@constants";
import { Logger } from "@logger";

const CTX = "activity";

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Persists cached activity timestamps on a timer.
 *
 * The tracker lives in memory so the message path costs nothing; this is what makes it survive a
 * restart. Only members touched since the last run are written, so an idle bot writes nothing.
 */
export function startActivityFlush(): void {
    if (timer) return;

    timer = setInterval(() => {
        flushActivity()
            .then(count => {
                if (count) Logger.debug(`Flushed ${count} activity timestamp(s), tracking ${trackedActivityCount()}`, CTX);
            })
            .catch(err => Logger.error(`Activity flush failed: ${err}`, CTX));
    }, ACTIVITY_FLUSH_INTERVAL_MS);

    Logger.info("Activity flush scheduler started", CTX);
}

export function stopActivityFlush(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
}
