import { Schema, model, type Document } from "mongoose";
import { ProjectType } from "./ProjectShare";

export interface IPendingProject extends Document {
    userId: string;
    type: ProjectType;
    projectId: string;
    projectType: "web" | "discord" | "other" | string;
    projectTitle: string;
    projectDescription: string;
    projectLinks: {
        github?: string;
        liveDemo?: string;
        other?: string;
    };
    youtubeTutorialLink?: string;
    envFileLink?: string;
    imageLink?: string;
    createdAt: Date;
    updatedAt: Date;
}

const pendingProjectSchema = new Schema<IPendingProject>(
    {
        userId: { type: String, required: true, index: true },
        type: { type: String, required: true, enum: Object.values(ProjectType) },
        projectId: { type: String, required: true, unique: true },
        projectType: { type: String, required: true },
        projectTitle: { type: String, required: true },
        projectDescription: { type: String, required: true },
        projectLinks: {
            github: { type: String, default: null },
            liveDemo: { type: String, default: null },
            other: { type: String, default: null }
        },
        youtubeTutorialLink: { type: String, default: null },
        envFileLink: { type: String, default: null },
        imageLink: { type: String, default: null }
    },
    { timestamps: true }
);

export const PendingProject = model<IPendingProject>("PendingProjects", pendingProjectSchema);
