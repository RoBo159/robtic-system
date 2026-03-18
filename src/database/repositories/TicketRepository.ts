import { Ticket, type ITicket } from "@database/models/Ticket";

export class TicketRepository {
  static async create(data: Partial<ITicket>): Promise<ITicket> {
    return Ticket.create(data);
  }

  static async findById(ticketId: string): Promise<ITicket | null> {
    return Ticket.findOne({ ticketId });
  }

  static async findByChannel(channelId: string): Promise<ITicket | null> {
    return Ticket.findOne({ channelId });
  }

  static async findOpenByUser(
    userId: string,
    guildId: string,
  ): Promise<ITicket[]> {
    return Ticket.find({ userId, guildId, status: { $ne: "closed" } });
  }

  static async findByGuild(
    guildId: string,
    status?: string,
  ): Promise<ITicket[]> {
    const query: Record<string, string> = { guildId };
    if (status) query.status = status;
    return Ticket.find(query).sort({ createdAt: -1 });
  }

  static async clearAll(): Promise<{ deletedCount?: number }> {
    return Ticket.deleteMany({});
  }
  
  static async close(
    ticketId: string,
    closedBy: string,
  ): Promise<ITicket | null> {
    return Ticket.findOneAndUpdate(
      { ticketId },
      { status: "closed", closedBy, closedAt: new Date() },
      { returnDocument: "after" },
    );
  }

  static async assign(
    ticketId: string,
    staffId: string,
  ): Promise<ITicket | null> {
    return Ticket.findOneAndUpdate(
      { ticketId },
      { assignedTo: staffId, status: "in-progress" },
      { returnDocument: "after" },
    );
  }

  static async escalate(ticketId: string): Promise<ITicket | null> {
    return Ticket.findOneAndUpdate(
      { ticketId },
      { status: "escalated" },
      { returnDocument: "after" },
    );
  }

  static async addMessage(
    ticketId: string,
    authorId: string,
    content: string,
  ): Promise<ITicket | null> {
    return Ticket.findOneAndUpdate(
      { ticketId },
      { $push: { messages: { authorId, content, timestamp: new Date() } } },
      { returnDocument: "after" },
    );
  }

  static async countByGuild(guildId: string): Promise<number> {
    return Ticket.countDocuments({ guildId });
  }
}
