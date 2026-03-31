import { Schema, model, type Document } from "mongoose";

export enum ProjectType {
    Member = "member",
    Developer = "developer",
    System = "system"
}

export interface IProject extends Document {
    userId: string;
    type: ProjectType;
    projectId: string;
    projectType: "web" | "discord" | "other";
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
    likes: string[];
    dislikes: string[];
    views: number;
    createdAt: Date;
    updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
    {
        userId: { type: String, required: true, index: true, trim: true },

        type: {
            type: String,
            required: true,
            enum: Object.values(ProjectType)
        },

        projectId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },

        projectType: {
            type: String,
            required: true,
            enum: ["web", "discord", "other"]
        },

        projectTitle: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,
            maxlength: 100
        },

        projectDescription: {
            type: String,
            required: true,
            trim: true,
            minlength: 10,
            maxlength: 2000
        },

        projectLinks: {
            github: { 
                type: String,
                match: /^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\/?$/,
                default: null,
                trim: true
            },
            liveDemo: { 
                type: String,
                match: /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/,
                default: null,
                trim: true
            },
            other: { 
                type: String,
                match: /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/,
                default: null,
                trim: true
            }
        },

        youtubeTutorialLink: { 
            type: String,
            match: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/,
            default: null,
            trim: true
        },
        envFileLink: { type: String },
        imageLink: { type: String },
        likes: { type: [String], default: [] },
        dislikes: { type: [String], default: [] },
        views: { type: Number, default: 0 }

    },
    { timestamps: true }
);

projectSchema.index({ userId: 1, projectTitle: 1 }, { unique: true });
projectSchema.index({ userId: 1, createdAt: -1 });
projectSchema.index({ projectTitle: "text", projectDescription: "text" });

export const Project = model<IProject>("Projects", projectSchema);
