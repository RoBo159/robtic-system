import { Reason, type IReason } from "@database/models/Reason";

export class ReasonRepository {
    static async create(data: Partial<IReason>): Promise<IReason> {
        return Reason.create(data);
    }

    static async findByKey(key: string): Promise<IReason | null> {
        return Reason.findOne({ key });
    }

    static async findByType(type: string): Promise<IReason[]> {
        return Reason.find({ type }).sort({ createdAt: -1 });
    }

    static async getAll(): Promise<IReason[]> {
        return Reason.find().sort({ type: 1, createdAt: -1 });
    }

    static async getAllKeys(): Promise<string[]> {
        const reasons = await Reason.find().select("key");
        return reasons.map(r => r.key);
    }

    static async delete(key: string): Promise<IReason | null> {
        return Reason.findOneAndDelete({ key });
    }
}
