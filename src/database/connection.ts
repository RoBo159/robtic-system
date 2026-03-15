import mongoose, { type ConnectOptions } from "mongoose";
import { Logger } from "@core/libs";
import { handleError, BotError } from "@core/handlers";

export async function connectDatabase(url: string): Promise<void> {
    try {
        await mongoose.connect(url, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        } as ConnectOptions);

        Logger.success(`MongoDB Connected: ${mongoose.connection.host}`, "Database");
    } catch (error) {
        handleError(new BotError("Failed to connect to MongoDB", "DATABASE"), "database/connection");
        process.exit(1);
    }
}

mongoose.connection.on("error", (err) => {
    handleError(new BotError(err.message, "DATABASE"), "mongoose");
});

mongoose.connection.on("disconnected", () => {
    Logger.warn("MongoDB disconnected", "Database");
});

process.on("SIGINT", async () => {
    await mongoose.connection.close();
    Logger.info("MongoDB connection closed (app termination)", "Database");
    process.exit(0);
});
