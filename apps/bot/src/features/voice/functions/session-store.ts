import { VoiceRepository } from "@database/repositories";
import { Logger } from "@logger";

const CTX = "voice";

export interface LiveSession {
    /** VoiceSession document id, so the row can be updated without another lookup. */
    id: string;
    guildId: string;
    discordId: string;
    username: string;
    channelId: string;
    joinedAt: number;
    lastTickAt: number;
    connectedSeconds: number;
    activeSeconds: number;
    xpEarned: number;
    /** Set when totals have moved since the last persist, so an idle session writes nothing. */
    dirty: boolean;
}

const sessions = new Map<string, LiveSession>();

const keyOf = (guildId: string, discordId: string) => `${guildId}:${discordId}`;

/**
 * Open sessions, in memory.
 *
 * The tick runs once a minute over every connected member, so the hot path must not touch the
 * database. Rows are written on open, on a slow timer while open, and on close — a crash therefore
 * costs at most one persist interval of a session, not the whole thing.
 */
export function getSession(guildId: string, discordId: string): LiveSession | undefined {
    return sessions.get(keyOf(guildId, discordId));
}

export function allSessions(): LiveSession[] {
    return [...sessions.values()];
}

export function sessionCount(): number {
    return sessions.size;
}

export async function startSession(guildId: string, discordId: string, username: string, channelId: string): Promise<LiveSession | null> {
    const key = keyOf(guildId, discordId);
    if (sessions.has(key)) return sessions.get(key)!;

    const now = Date.now();

    try {
        const doc = await VoiceRepository.openSession(guildId, discordId, username, channelId, new Date(now));

        const session: LiveSession = {
            id: String(doc._id),
            guildId,
            discordId,
            username,
            channelId,
            joinedAt: now,
            lastTickAt: now,
            connectedSeconds: 0,
            activeSeconds: 0,
            xpEarned: 0,
            dirty: false,
        };

        sessions.set(key, session);
        return session;
    } catch (err) {
        Logger.warn(`Could not open a voice session for ${discordId} in ${guildId}: ${err}`, CTX);
        return null;
    }
}

/** Moves a session to another channel without ending it — a channel switch is not a new stay. */
export function moveSession(guildId: string, discordId: string, channelId: string): void {
    const session = sessions.get(keyOf(guildId, discordId));
    if (session) session.channelId = channelId;
}

export async function endSession(guildId: string, discordId: string): Promise<LiveSession | null> {
    const key = keyOf(guildId, discordId);
    const session = sessions.get(key);
    if (!session) return null;

    sessions.delete(key);

    try {
        await VoiceRepository.closeSession(
            session.id,
            guildId,
            discordId,
            session.username,
            {
                connectedSeconds: session.connectedSeconds,
                activeSeconds: session.activeSeconds,
                xpEarned: session.xpEarned,
            },
            new Date(),
        );
    } catch (err) {
        Logger.warn(`Could not close the voice session for ${discordId} in ${guildId}: ${err}`, CTX);
    }

    return session;
}

/** Writes back every session whose totals moved since the last call. */
export async function persistDirtySessions(): Promise<number> {
    const pending = [...sessions.values()].filter(s => s.dirty);
    if (!pending.length) return 0;

    for (const session of pending) {
        session.dirty = false;

        await VoiceRepository.persistSession(
            session.id,
            {
                connectedSeconds: session.connectedSeconds,
                activeSeconds: session.activeSeconds,
                xpEarned: session.xpEarned,
            },
            new Date(session.lastTickAt),
        ).catch(err => Logger.warn(`Could not persist voice session ${session.id}: ${err}`, CTX));
    }

    return pending.length;
}

/** Drops in-memory sessions for a guild the bot has left, without writing them back. */
export function forgetGuildSessions(guildId: string): void {
    const prefix = `${guildId}:`;
    for (const key of sessions.keys()) {
        if (key.startsWith(prefix)) sessions.delete(key);
    }
}
