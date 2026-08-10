import type { Guild, GuildMember } from "discord.js";
import { StaffTierRepository, StaffRepository } from "@database/repositories";
import { STAFF_CATEGORY_LABELS } from "@constants";

export type MoveResult =
    | { ok: true; previousTierName: string; previousScore: number; newTierName: string; newScore: number }
    | { ok: false; reason: "no-ladder" | "at-top" | "at-bottom" };

/** Moves a staff member one rung up/down their department's StaffTier ladder, swapping roles and updating StaffMember.position. */
export async function moveStaffTier(
    guild: Guild,
    targetMember: GuildMember,
    department: string,
    direction: "up" | "down",
): Promise<MoveResult> {
    const tiers = await StaffTierRepository.list(guild.id);
    const ladder = tiers
        .filter(t => t.department?.toLowerCase() === department.toLowerCase())
        .sort((a, b) => a.score - b.score);

    if (!ladder.length) return { ok: false, reason: "no-ladder" };

    let currentIndex = -1;
    for (let i = ladder.length - 1; i >= 0; i--) {
        if (ladder[i].roleIds.some(id => targetMember.roles.cache.has(id))) {
            currentIndex = i;
            break;
        }
    }

    const newIndex = direction === "up" ? currentIndex + 1 : currentIndex - 1;
    if (direction === "down" && currentIndex < 0) return { ok: false, reason: "at-bottom" };
    if (newIndex < 0) return { ok: false, reason: "at-bottom" };
    if (newIndex >= ladder.length) return { ok: false, reason: "at-top" };

    const previousTier = currentIndex >= 0 ? ladder[currentIndex] : null;
    const newTier = ladder[newIndex];

    for (const tier of ladder) {
        for (const roleId of tier.roleIds) {
            if (targetMember.roles.cache.has(roleId)) {
                await targetMember.roles.remove(roleId).catch(() => null);
            }
        }
    }
    for (const roleId of newTier.roleIds) {
        await targetMember.roles.add(roleId).catch(() => null);
    }

    await StaffRepository.updatePosition(targetMember.id, newTier.name, department);

    return {
        ok: true,
        previousTierName: previousTier?.name ?? STAFF_CATEGORY_LABELS.none,
        previousScore: previousTier?.score ?? 0,
        newTierName: newTier.name,
        newScore: newTier.score,
    };
}
