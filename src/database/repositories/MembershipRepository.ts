import { Membership, type IMembership } from "@database/models/Membership";
import { ServiceTier, type IServiceTier } from "@database/models/ServiceTier";

export class MembershipRepository {
    static async findByUser(discordId: string, guildId: string): Promise<IMembership | null> {
        return Membership.findOne({ discordId, guildId });
    }

    static async create(data: Partial<IMembership>): Promise<IMembership> {
        return Membership.create(data);
    }

    static async updateTier(discordId: string, guildId: string, tier: string): Promise<IMembership | null> {
        return Membership.findOneAndUpdate(
            { discordId, guildId },
            { tier },
            { new: true }
        );
    }

    static async deactivate(discordId: string, guildId: string): Promise<IMembership | null> {
        return Membership.findOneAndUpdate(
            { discordId, guildId },
            { active: false, endDate: new Date() },
            { new: true }
        );
    }

    static async findExpired(): Promise<IMembership[]> {
        return Membership.find({
            active: true,
            endDate: { $lte: new Date() },
        });
    }

    static async findAllActive(guildId: string): Promise<IMembership[]> {
        return Membership.find({ guildId, active: true });
    }

    // Service Tier methods
    static async createTier(data: Partial<IServiceTier>): Promise<IServiceTier> {
        return ServiceTier.create(data);
    }

    static async findTier(name: string, guildId: string): Promise<IServiceTier | null> {
        return ServiceTier.findOne({ name, guildId });
    }

    static async findAllTiers(guildId: string): Promise<IServiceTier[]> {
        return ServiceTier.find({ guildId, active: true }).sort({ price: 1 });
    }
}
