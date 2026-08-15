import { PointsRepository } from "@database/repositories";
import { RcConversion } from "@database/models";
import { getPointRates } from "./get-point-rates";

export type ConversionFailure =
    | "disabled"
    | "below-minimum"
    | "not-a-multiple"
    | "insufficient";

export interface ConversionResult {
    ok: boolean;
    reason?: ConversionFailure;
    /** Populated on success. */
    pointsSpent?: number;
    rcGranted?: number;
    rate?: number;
    pointsAfter?: number;
    rcAfter?: number;
    /** Context for the failure message — the minimum, or the balance they actually have. */
    detail?: number;
}

/**
 * Exchanges Points for RC.
 *
 * RC is never earned from activity directly; this is the only way it comes into existence, which
 * keeps one place to reason about supply. Every conversion is written to RcConversion with the
 * rate that applied, because a guild can change the rate and an old row still has to mean what it
 * meant then.
 *
 * `fee` and `bonus` are recorded as zero rather than omitted, so taxes and membership perks can
 * arrive later without a migration.
 *
 * Points are deducted before RC is credited. If the process dies between the two the member is
 * short-changed rather than able to mint RC from a balance they still hold — the safer failure.
 */
export async function convertPointsToRc(
    guildId: string,
    discordId: string,
    username: string,
    pointsToSpend: number,
): Promise<ConversionResult> {
    const rates = await getPointRates(guildId);

    if (!rates.conversionEnabled) return { ok: false, reason: "disabled" };
    if (pointsToSpend < rates.minConversionPoints) {
        return { ok: false, reason: "below-minimum", detail: rates.minConversionPoints };
    }
    if (pointsToSpend % rates.pointsPerRc !== 0) {
        return { ok: false, reason: "not-a-multiple", detail: rates.pointsPerRc };
    }

    const wallet = await PointsRepository.findOrCreate(guildId, discordId, username);
    if (wallet.points < pointsToSpend) {
        return { ok: false, reason: "insufficient", detail: wallet.points };
    }

    const rcGranted = pointsToSpend / rates.pointsPerRc;

    const afterSpend = await PointsRepository.move({
        guildId,
        discordId,
        username,
        amount: -pointsToSpend,
        source: "conversion",
        detail: `→ ${rcGranted} RC`,
    });

    const afterCredit = await PointsRepository.addRc(guildId, discordId, rcGranted);

    await RcConversion.create({
        guildId,
        discordId,
        pointsSpent: pointsToSpend,
        rcGranted,
        rate: rates.pointsPerRc,
        fee: 0,
        bonus: 0,
    });

    return {
        ok: true,
        pointsSpent: pointsToSpend,
        rcGranted,
        rate: rates.pointsPerRc,
        pointsAfter: afterSpend.points,
        rcAfter: afterCredit.rc,
    };
}
