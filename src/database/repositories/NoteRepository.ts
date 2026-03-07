import { Note, type INote } from "@database/models/Note";

export class NoteRepository {
    static async create(userId: string, content: string, createdBy: string): Promise<INote> {
        return Note.create({ userId, content, createdBy });
    }

    static async findByUser(userId: string): Promise<INote[]> {
        return Note.find({ userId }).sort({ createdAt: -1 });
    }

    static async delete(noteId: string): Promise<INote | null> {
        return Note.findByIdAndDelete(noteId);
    }

    static async count(userId: string): Promise<number> {
        return Note.countDocuments({ userId });
    }
}
