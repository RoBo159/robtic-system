import type { Question } from "bot/hr/config/questions";
import { Document, model, Schema } from "mongoose";

export interface ISubmission extends Document {
  userId: string;
  department: Department;
  questions: Question[];
  isApproved: boolean;
  threadId: string | null;
  createdAt: Date;
}

const SubmissionSchema = new Schema<ISubmission>({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  department: {
    type: String,
    required: true,
  },
  questions: {
    type: [
      {
        id: { type: Number },
        question: { type: String, required: true },
        answer: { type: String, required: true },
      },
    ],
  },
  isApproved: {
    type: Boolean,
    default: false,
    required: true,
  },
  threadId: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
});

export const Submission = model<ISubmission>("Submission", SubmissionSchema);
