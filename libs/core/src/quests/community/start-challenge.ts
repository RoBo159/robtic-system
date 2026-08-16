import { CommunityChallengeRepository, QuestSettingsRepository } from "@database/repositories";
import type { ICommunityChallenge } from "@database/models";
import { Logger } from "@logger";
import { communityTemplates } from "../missions";

import { localWeekKey } from "../generation/windows";

const CTX = "quests";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Opens this week's challenge, if it is not already open.
 *
 * The unique `(guildId, weekKey)` index is the guard: a racing tick, or a second process, gets null
 * from `create` and carries on with the existing one. The week key is derived from the guild's own
 * clock so a challenge turns over at a sensible local hour.
 */
export async function ensureWeeklyChallenge(guildId: string, now = new Date()): Promise<ICommunityChallenge | null> {
    const settings = await QuestSettingsRepository.getCached(guildId);
    if (!settings.communityEnabled) return null;

    const weekKey = localWeekKey(now.getTime(), settings.utcOffsetMinutes);

    const existing = await CommunityChallengeRepository.findByWeek(guildId, weekKey);
    if (existing) return existing.status === "active" ? existing : null;

    const templates = communityTemplates();
    if (templates.length === 0) return null;

    // Rolled freshly. The challenge document is the record of what was chosen, and the unique
    // (guildId, weekKey) index means a retry either finds the existing week or creates the only one.
    const template = templates[Math.floor(Math.random() * templates.length)]!;
    const target = Math.max(1, Math.round(template.communityTarget?.() ?? 1000));

    const created = await CommunityChallengeRepository.create({
        guildId,
        weekKey,
        status: "active",
        missions: [{
            missionId: "c1",
            templateKey: template.key,
            metric: template.metric,
            target,
            label: template.label(target),
        }],
        target,
        total: 0,
        rewardBase: settings.communityRewardBase,
        minContribution: settings.communityMinContribution,
        startedAt: now,
        endsAt: new Date(now.getTime() + WEEK_MS),
    });

    if (created) Logger.info(`Opened community challenge ${weekKey} for ${guildId}`, CTX);
    return created;
}
