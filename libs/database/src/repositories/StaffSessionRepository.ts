import { StaffSession, type IStaffSession, type StaffSessionEndReason } from "@database/models/StaffSession";

export class StaffSessionRepository {
    static async open(input: {
        guildId: string;
        minecraftUuid: string;
        minecraftUsername: string;
        discordId?: string;
        serverId: string;
        rankGroup: string;
        rankName: string;
        baseGroup: string;
    }): Promise<IStaffSession> {
        return StaffSession.create({ ...input, minecraftUuid: input.minecraftUuid.toLowerCase() });
    }

    static async findActive(guildId: string, minecraftUuid: string): Promise<IStaffSession | null> {
        return StaffSession.findOne({ guildId, minecraftUuid: minecraftUuid.toLowerCase(), active: true });
    }

    /**
     * Closes the open session and stamps its duration. The duration is computed here rather than
     * at read time so the analytics queries never have to reason about a session still running.
     */
    static async close(
        guildId: string,
        minecraftUuid: string,
        endReason: StaffSessionEndReason,
    ): Promise<IStaffSession | null> {
        const session = await StaffSession.findOne({
            guildId,
            minecraftUuid: minecraftUuid.toLowerCase(),
            active: true,
        });
        if (!session) return null;

        const endedAt = new Date();
        session.endedAt = endedAt;
        session.endReason = endReason;
        session.durationMs = endedAt.getTime() - session.startedAt.getTime();
        session.active = false;
        await session.save();

        return session;
    }

    /** Every session still marked open on a server, which a restart has to reconcile. */
    static async listActive(guildId: string, serverId?: string): Promise<IStaffSession[]> {
        return StaffSession.find({ guildId, active: true, ...(serverId ? { serverId } : {}) });
    }

    static async countByMember(guildId: string, minecraftUuid: string): Promise<number> {
        return StaffSession.countDocuments({ guildId, minecraftUuid: minecraftUuid.toLowerCase() });
    }
}
