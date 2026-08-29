package org.robtic.core.cache;

import java.util.concurrent.TimeUnit;

/**
 * How long each kind of cached value is trusted.
 *
 * Gathered in one place because the numbers only make sense next to each other: the premium TTL is
 * long precisely because a tier rarely changes, and the profile TTL is shorter because a jail or a
 * rank change should show up sooner than that.
 *
 * A TTL of {@link #FOREVER} means the value is never re-fetched on a timer at all — it is loaded
 * once and replaced only when the thing that owns it changes. Spawn, homes and locked chests are
 * all like this: the plugin knows exactly when they change, because it is what changed them.
 */
public final class CachePolicy {

    /** Never expires on its own. Invalidated explicitly by the command that changes it. */
    public static final long FOREVER = Long.MAX_VALUE;

    /** Premium tier and its limits. Long, because a subscription rarely changes mid-session. */
    public static final long PREMIUM_MILLIS = TimeUnit.MINUTES.toMillis(30);

    /** The aggregate profile: link, statistics, jail state. */
    public static final long PROFILE_MILLIS = TimeUnit.MINUTES.toMillis(10);

    /**
     * How stale a cached value may get before it is discarded rather than served.
     *
     * Well past every TTL above: the point is not freshness, it is that a value old enough to be
     * actively wrong is worse than telling the player the feature is unavailable.
     */
    public static final long MAX_AGE_MILLIS = TimeUnit.HOURS.toMillis(6);

    private CachePolicy() {
    }
}
