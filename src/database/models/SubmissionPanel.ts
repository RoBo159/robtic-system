import { Document, model, Schema } from "mongoose";

export interface ISubmissionPanel extends Document {
  messageId: string;
  channelId: string;
  department: Department;
  createdAt: Date;
}

const SubmissionPanelSchema = new Schema<ISubmissionPanel>({
  messageId: {
    type: String,
    required: true,
    unique: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
});

export const SubmissionPanel = model<ISubmissionPanel>(
  "SubmissionPanel",
  SubmissionPanelSchema,
);
