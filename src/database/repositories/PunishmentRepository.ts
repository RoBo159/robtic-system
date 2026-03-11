import { Punishment, type IPunishment } from "@database/models/Punishment";
import { User } from "@database/models/User";
import { MembersPunishments, PunishmentsSystem } from "@core/config";

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

    static async findByUserAndType(userId: string, guildId: string, type: string): Promise<IPunishment[]> {
        return Punishment.find({ userId, guildId, type, active: true }).sort({ createdAt: -1 });
    }

    static async findAllByUserAndType(userId: string, guildId: string, type: string): Promise<IPunishment[]> {
        return Punishment.find({ userId, guildId, type }).sort({ createdAt: -1 });
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
            { returnDocument: "after" }
        );
    }

    static async appeal(caseId: string, reason: string): Promise<IPunishment | null> {
        return Punishment.findOneAndUpdate(
            { caseId },
            { appealed: true, active: false, appealReason: reason },
            { returnDocument: "after" }
        );
    }

    static async countByUser(userId: string, guildId: string): Promise<number> {
        return Punishment.countDocuments({ userId, guildId });
    }

    static async getNextCaseId(guildId: string): Promise<string> {
        const count = await Punishment.countDocuments({ guildId });
        return `CASE-${(count + 1).toString().padStart(5, "0")}`;
    }

    static async getOrCreateUser(discordId: string, username: string) {
        let user = await User.findOne({ discordId });
        if (!user) {
            user = await User.create({ discordId, username });
        }
        return user;
    }

    static async addPunishmentLevel(discordId: string, username: string, points: number) {
        const user = await this.getOrCreateUser(discordId, username);
        user.punishmentLevel = Math.min(100, (user.punishmentLevel || 0) + points);
        await user.save();
        return user.punishmentLevel;
    }

    static async removePunishmentLevel(discordId: string, username: string, points: number) {
        const user = await this.getOrCreateUser(discordId, username);
        user.punishmentLevel = Math.max(0, (user.punishmentLevel || 0) - points);
        await user.save();
        return user.punishmentLevel;
    }

    static async getPunishmentLevel(discordId: string): Promise<number> {
        const user = await User.findOne({ discordId });
        return user?.punishmentLevel ?? 0;
    }

    static getLevelInfo(level: number): { role: string | null; roleId: string | null; name: string } {
        if (level >= MembersPunishments.permBan.level) return { role: MembersPunishments.permBan.name, roleId: MembersPunishments.permBan.id, name: "Permanent Ban" };
        if (level >= MembersPunishments.tempBan.level) return { role: MembersPunishments.tempBan.name, roleId: MembersPunishments.tempBan.id, name: "Temporary Ban" };
        if (level >= MembersPunishments.tempMute.level) return { role: MembersPunishments.tempMute.name, roleId: MembersPunishments.tempMute.id, name: "Temporary Mute" };
        if (level >= MembersPunishments.fWarn.level) return { role: MembersPunishments.fWarn.name, roleId: MembersPunishments.fWarn.id, name: "Final Warning" };
        if (level >= MembersPunishments.warn.level) return { role: MembersPunishments.warn.name, roleId: MembersPunishments.warn.id, name: "Warning" };
        return { role: null, roleId: null, name: "Clean" };
    }
}
