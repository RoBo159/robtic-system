import { Punishment, type IPunishment } from "@database/models/Punishment.ts";

export class PunishmentRepository {
    static async create(data: Partial<IPunishment>): Promise<IPunishment> {
        return Punishment.create(data);
    }

    static async findByCaseId(caseId: string): Promise<IPunishment | null> {
        return Punishment.findOne({ caseId });
    }

    static async findByUser(userId: string, guildId: string): Promise<IPunishment[]> {
        return Punishment.find({ userId, guildId }).sort({ createdAt: -1 });
    }

    static async findActiveByUser(userId: string, guildId: string): Promise<IPunishment[]> {
        return Punishment.find({ userId, guildId, active: true });
    }

    static async findExpired(): Promise<IPunishment[]> {
        return Punishment.find({
            active: true,
            expiresAt: { $lte: new Date() },
        });
    }

    static async deactivate(caseId: string): Promise<IPunishment | null> {
        return Punishment.findOneAndUpdate(
            { caseId },
            { active: false },
            { new: true }
        );
    }

    static async appeal(caseId: string, reason: string): Promise<IPunishment | null> {
        return Punishment.findOneAndUpdate(
            { caseId },
            { appealed: true, appealReason: reason },
            { new: true }
        );
    }

    static async countByUser(userId: string, guildId: string): Promise<number> {
        return Punishment.countDocuments({ userId, guildId });
    }

    static async getNextCaseId(guildId: string): Promise<string> {
        const count = await Punishment.countDocuments({ guildId });
        return `CASE-${(count + 1).toString().padStart(5, "0")}`;
    }
}
