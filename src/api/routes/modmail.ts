import { Router } from "express";
import { ModMailRepository } from "@database/repositories";
import { isAuthenticated, loadGuildMember, requireModAccess } from "../middleware.js";

const router = Router();

router.use(isAuthenticated, loadGuildMember, requireModAccess);

// GET /api/modmail/threads — all threads (open + closed)
router.get("/threads", async (_req, res) => {
    const guildId = process.env.MainGuild!;
    const [openThreads, closedThreads] = await Promise.all([
        ModMailRepository.findAllOpen(guildId),
        ModMailRepository.findAllClosed(guildId),
    ]);

    const mapThread = (t: any) => ({
        threadId: t.threadId,
        userId: t.userId,
        language: t.language,
        requestType: t.requestType,
        status: t.status,
        paused: t.paused,
        claimedBy: t.claimedBy,
        closedBy: t.closedBy,
        closedAt: t.closedAt,
        createdAt: t.createdAt,
        messageCount: t.messages.length,
    });

    res.json({
        open: openThreads.map(mapThread),
        closed: closedThreads.map(mapThread),
    });
});

// GET /api/modmail/transcript/:id — single transcript
router.get("/transcript/:id", async (req, res) => {
    const threadId = req.params.id as string;
    if (!/^[a-zA-Z0-9_-]+$/.test(threadId)) {
        return res.status(400).json({ error: "Invalid thread ID" });
    }

    const thread = await ModMailRepository.findByThreadId(threadId);
    if (!thread) {
        return res.status(404).json({ error: "Transcript not found" });
    }

    res.json({
        threadId: thread.threadId,
        userId: thread.userId,
        guildId: thread.guildId,
        language: thread.language,
        requestType: thread.requestType,
        status: thread.status,
        paused: thread.paused,
        claimedBy: thread.claimedBy,
        closedBy: thread.closedBy,
        closedAt: thread.closedAt,
        createdAt: thread.createdAt,
        messages: thread.messages.map((m) => ({
            authorId: m.authorId,
            authorType: m.authorType,
            content: m.content,
            attachments: m.attachments,
            timestamp: m.timestamp,
        })),
    });
});

export default router;
