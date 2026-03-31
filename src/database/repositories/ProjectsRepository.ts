import { Project, type IProject } from "@database/models";

export class ProjectsRepository {
    static async create(projectData: Omit<IProject, "projectId" | "createdAt" | "updatedAt">): Promise<IProject> {
        return Project.create(projectData);
    }

    static async findByProjectId(projectId: string): Promise<IProject | null> {
        return Project.findOne({ projectId });
    }

    static async findByUserId(userId: string): Promise<IProject[]> {
        return Project.find({ userId }).sort({ createdAt: -1 });
    }

    static async delete(projectId: string): Promise<IProject | null> {
        return Project.findOneAndDelete({ projectId });
    }
    
    static async searchByTitleOrDescription(query: string): Promise<IProject[]> {
        return Project.find(
            { $text: { $search: query } },
            { score: { $meta: "textScore" } }
        ).sort({ score: { $meta: "textScore" } });
    }

    static async update(projectId: string, updateData: Partial<Omit<IProject, "projectId" | "userId" | "createdAt">>): Promise<IProject | null> {
        return Project.findOneAndUpdate(
            { projectId },
            { ...updateData, updatedAt: new Date() },
            { returnDocument: "after" }
        );
    }
}
