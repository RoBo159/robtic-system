import { Router } from "express";
import passport from "passport";
import { isAuthenticated, loadGuildMember } from "../middleware.js";

const router = Router();

// Discord OAuth login
router.get("/login", passport.authenticate("discord"));

// Discord OAuth callback
router.get(
    "/callback",
    passport.authenticate("discord", { failureRedirect: "/auth/login" }),
    (_req, res) => {
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        res.redirect(frontendUrl);
    },
);

// Logout
router.post("/logout", (req, res) => {
    req.logout(() => {
        res.json({ success: true });
    });
});

// Get current user session
router.get("/me", isAuthenticated, loadGuildMember, (req, res) => {
    const member = (req as any).__guildMember;
    res.json({
        id: req.user!.id,
        username: req.user!.username,
        avatar: req.user!.avatar,
        member: member
            ? {
                roles: member.roles.cache
                    .filter((r: any) => r.id !== member.guild.id)
                    .map((r: any) => ({ id: r.id, name: r.name, color: r.hexColor })),
                joinedAt: member.joinedAt,
            }
            : null,
    });
});

export default router;
