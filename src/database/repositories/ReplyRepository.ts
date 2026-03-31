import { Reply, type IReply } from "@database/models/Reply";

export class ReplyRepository {
    static async addReply(guildId: string, trigger: string, reply: string): Promise<IReply> {
        let doc = await Reply.findOne({ guildId, trigger });
        if (!doc) {
            doc = await Reply.create({ guildId, trigger, replies: [reply] });
        } else {
            if (!doc.replies.includes(reply)) doc.replies.push(reply);
            await doc.save();
        }
        return doc;
    }

    static async deleteReply(guildId: string, trigger: string): Promise<IReply | null> {
        return Reply.findOneAndDelete({ guildId, trigger });
    }

    static async getReply(guildId: string, trigger: string): Promise<IReply | null> {
        return Reply.findOne({ guildId, trigger });
    }

    static async getAllTriggers(guildId: string): Promise<string[]> {
        const docs = await Reply.find({ guildId });
        return docs.map(d => d.trigger);
    }

    static async getRandomReply(guildId: string, trigger: string): Promise<string | null> {
        const doc = await Reply.findOne({ guildId, trigger });
        if (!doc || !doc.replies.length) return null;
        return doc.replies[Math.floor(Math.random() * doc.replies.length)];
    }
}
