import type { ProfileDetails, ProfileStaffDetails } from "@typings/profile";
import {
    ActivityRepository,
    ActivityLogRepository,
    NoteRepository,
    PunishmentRepository,
    SupportSessionRepository,
    UserRepository,
} from "@database/repositories";

const RECENT_LOG_LIMIT = 10;
const NOTES_LIMIT = 15;
const PUNISHMENTS_LIMIT = 20;

interface DetailsInput {
    guildId: string;
    /** Whose details to read. */
    targetId: string;
    /** Who is asking — controls the privacy gate. */
    viewerId: string;
    username: string;
}

/**
 * Everything the bot's /profile dropdown shows beyond the snapshot (activity log, staff stats,
 * notes, projects, punishment history) for the Activity's detail sections. Repository-only, no
 * discord.js. Returns null when the target keeps their profile private from this viewer.
 */
export async function getProfileDetails(input: DetailsInput): Promise<ProfileDetails | null> {
    const { guildId, targetId, viewerId, username } = input;

    if (targetId !== viewerId && await UserRepository.getPrivateProfile(targetId)) return null;

    const [record, logs, notes, punishments, punishmentLevel, supportStats] = await Promise.all([
        ActivityRepository.findOrCreate(targetId, guildId, username),
        ActivityLogRepository.getByUser(targetId, guildId, RECENT_LOG_LIMIT),
        NoteRepository.findByUser(targetId),
        PunishmentRepository.findByUser(targetId, guildId),
        PunishmentRepository.getPunishmentLevel(targetId),
        SupportSessionRepository.getStaffStats(targetId),
    ]);

    const staffPointsTotal =
        record.staff.supportPoints +
        record.staff.publicChatPoints +
        record.staff.staffChatPoints +
        record.staff.moderationPoints;

    // Role checks need a gateway client; a nonzero staff record is the repository-level proxy for "is staff".
    const staff: ProfileStaffDetails | null = staffPointsTotal > 0 || record.staff.penalties > 0
        ? {
            supportPoints: record.staff.supportPoints,
            publicChatPoints: record.staff.publicChatPoints,
            staffChatPoints: record.staff.staffChatPoints,
            moderationPoints: record.staff.moderationPoints,
            penalties: record.staff.penalties,
            totalStaffPoints: staffPointsTotal - record.staff.penalties,
            sessionsClaimed: supportStats.totalClaimed,
            sessionsResolved: supportStats.totalResolved,
            avgResponseMs: supportStats.avgResponseMs,
            supportPointsEarned: supportStats.totalPoints,
        }
        : null;

    return {
        activity: {
            realMessageCount: record.realMessageCount,
            decayEnabled: record.decay.enabled,
            decayLastActiveAt: record.decay.enabled ? record.decay.lastActiveAt.getTime() : null,
            decayInactiveDays: record.decay.inactiveDays,
            recent: logs.map(log => ({
                type: log.type,
                amount: log.amount,
                details: log.details ?? null,
                createdAt: log.createdAt.getTime(),
            })),
        },
        staff,
        notes: notes.slice(0, NOTES_LIMIT).map(note => ({
            content: note.content,
            createdBy: note.createdBy,
            createdAt: note.createdAt.getTime(),
        })),
        punishments: punishments.slice(0, PUNISHMENTS_LIMIT).map(punishment => ({
            caseId: punishment.caseId,
            type: punishment.type,
            reason: punishment.reason,
            active: punishment.active,
            appealed: punishment.appealed,
            createdAt: punishment.createdAt.getTime(),
        })),
        punishmentLevel,
    };
}
