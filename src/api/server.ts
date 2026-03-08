import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import passport from "passport";
import { Logger } from "@core/libs";
import { setupPassport } from "./passport.js";
import authRoutes from "./routes/auth.js";
import modmailRoutes from "./routes/modmail.js";

const API_PORT = Number(process.env.API_PORT) || 3300;
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${API_PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export function getTranscriptUrl(threadId: string): string {
    return `${FRONTEND_URL}/modmail/transcript/${threadId}`;
}

export function startApiServer() {
    setupPassport();

    const app = express();

    // Trust reverse proxy (Nginx) for secure cookies
    if (process.env.NODE_ENV === "production") {
        app.set("trust proxy", 1);
    }

    app.use(express.json());

    // Session with MongoDB store
    app.use(
        session({
            secret: process.env.SESSION_SECRET || "robtic-secret",
            resave: false,
            saveUninitialized: false,
            store: MongoStore.create({
                mongoUrl: process.env.MONGODB_URI!,
                collectionName: "sessions",
                ttl: 7 * 24 * 60 * 60,
            }),
            cookie: {
                maxAge: 7 * 24 * 60 * 60 * 1000,
                secure: process.env.NODE_ENV === "production",
                httpOnly: true,
                sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
                domain: process.env.COOKIE_DOMAIN || undefined,
            },
        }),
    );

    app.use(passport.initialize());
    app.use(passport.session());

    // CORS for frontend
    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", FRONTEND_URL);
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") {
            return res.sendStatus(204);
        }
        next();
    });

    // Routes
    app.use("/auth", authRoutes);
    app.use("/api/modmail", modmailRoutes);

    // Health check
    app.get("/health", (_req, res) => res.json({ status: "ok" }));

    app.listen(API_PORT, () => {
        Logger.success(`API server running on ${API_BASE_URL}`, "API");
    });
}
