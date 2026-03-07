import { Tag, type ITag } from "@database/models/Tag";

export class TagRepository {
    static async create(key: string, description: string, content: string, createdBy: string): Promise<ITag> {
        return Tag.create({ key, description, content, createdBy });
    }

    static async findByKey(key: string): Promise<ITag | null> {
        return Tag.findOne({ key });
    }

    static async getAll(): Promise<ITag[]> {
        return Tag.find().sort({ key: 1 });
    }

    static async delete(key: string): Promise<ITag | null> {
        return Tag.findOneAndDelete({ key });
    }

    static async getAllKeys(): Promise<string[]> {
        const tags = await Tag.find().select("key").lean();
        return tags.map(t => t.key);
    }
}
