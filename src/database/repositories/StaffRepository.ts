import { StaffMember, type IStaffMember } from "@database/models/StaffMember";
import { StaffPromotion, type IStaffPromotion } from "@database/models/StaffPromotion";

export class StaffRepository {
    static async create(data: Partial<IStaffMember>): Promise<IStaffMember> {
        return StaffMember.create(data);
    }

    static async findByDiscordId(discordId: string): Promise<IStaffMember | null> {
        return StaffMember.findOne({ discordId });
    }

    static async findByDepartment(department: string): Promise<IStaffMember[]> {
        return StaffMember.find({ department, status: "active" });
    }

    static async findAll(status?: string): Promise<IStaffMember[]> {
        const query = status ? { status } : {};
        return StaffMember.find(query).sort({ department: 1, position: 1 });
    }

    static async updatePosition(
        discordId: string,
        newPosition: string,
        newDepartment: string
    ): Promise<IStaffMember | null> {
        return StaffMember.findOneAndUpdate(
            { discordId },
            { position: newPosition, department: newDepartment },
            { new: true }
        );
    }

    static async addWarning(
        discordId: string,
        reason: string,
        issuedBy: string
    ): Promise<IStaffMember | null> {
        return StaffMember.findOneAndUpdate(
            { discordId },
            { $push: { warnings: { reason, issuedBy, date: new Date() } } },
            { new: true }
        );
    }

    static async terminate(discordId: string): Promise<IStaffMember | null> {
        return StaffMember.findOneAndUpdate(
            { discordId },
            { status: "terminated" },
            { new: true }
        );
    }

    static async createPromotion(data: Partial<IStaffPromotion>): Promise<IStaffPromotion> {
        return StaffPromotion.create(data);
    }

    static async getPromotionHistory(discordId: string): Promise<IStaffPromotion[]> {
        return StaffPromotion.find({ discordId }).sort({ createdAt: -1 });
    }
}
