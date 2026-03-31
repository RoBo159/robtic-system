import { StaffMember, type IStaffMember } from "@database/models/StaffMember";
import {
  StaffPromotion,
  type IStaffPromotion,
} from "@database/models/StaffPromotion";
import {
  SubmissionPanel,
  type ISubmissionPanel,
} from "@database/models/SubmissionPanel";
import { Submission, type ISubmission } from "@database/models/Submission";

export class StaffRepository {
  static async create(data: Partial<IStaffMember>): Promise<IStaffMember> {
    return StaffMember.create(data);
  }

  static async findByDiscordId(
    discordId: string,
  ): Promise<IStaffMember | null> {
    return StaffMember.findOne({ discordId });
  }

  static async findByDepartment(department: string): Promise<IStaffMember[]> {
    return StaffMember.find({ department, status: "active" });
  }

  static async findAll(status?: string): Promise<IStaffMember[]> {
    const query = status ? { status } : {};
    return StaffMember.find(query).sort({ department: 1, position: 1 });
  }

  static async updatePosition(
    discordId: string,
    newPosition: string,
    newDepartment: string,
  ): Promise<IStaffMember | null> {
    return StaffMember.findOneAndUpdate(
      { discordId },
      { position: newPosition, department: newDepartment },
      { returnDocument: "after" },
    );
  }

  static async addWarning(
    discordId: string,
    reason: string,
    issuedBy: string,
  ): Promise<IStaffMember | null> {
    return StaffMember.findOneAndUpdate(
      { discordId },
      { $push: { warnings: { reason, issuedBy, date: new Date() } } },
      { returnDocument: "after" },
    );
  }

  static async terminate(discordId: string): Promise<IStaffMember | null> {
    return StaffMember.findOneAndUpdate(
      { discordId },
      { status: "terminated" },
      { returnDocument: "after" },
    );
  }

  static async createPromotion(
    data: Partial<IStaffPromotion>,
  ): Promise<IStaffPromotion> {
    return StaffPromotion.create(data);
  }

  static async getPromotionHistory(
    discordId: string,
  ): Promise<IStaffPromotion[]> {
    return StaffPromotion.find({ discordId }).sort({ createdAt: -1 });
  }

  static async openSubmission(
    data: Partial<ISubmissionPanel>,
  ): Promise<ISubmissionPanel> {
    return new SubmissionPanel(data).save();
  }

  static async createSubmission(
    data: Partial<ISubmission>,
  ): Promise<ISubmission> {
    return new Submission(data).save();
  }

  static async deleteSubmission(userId: string): Promise<ISubmission | null> {
    return Submission.findOneAndDelete({
      userId,
    });
  }

  static async getSubmission(userId: string): Promise<ISubmission | null> {
    return Submission.findOne({
      userId,
    });
  }

  static async getSubmissionByThreadId(
    threadId: string,
  ): Promise<ISubmission | null> {
    return Submission.findOne({
      threadId,
    });
  }

  // static async findSubmissionByDepartment(
  //   userId: string,
  //   department: Department,
  // ): Promise<ISubmission | null> {
  //   return Submission.findOne({
  //     userId,
  //     department,
  //   });
  // }
}
