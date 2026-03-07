import mongoose, { type ConnectOptions } from "mongoose";
import { Logger } from "@core/libs";
import { handleError, BotError } from "@core/handlers";
import { sendStatus } from "@core/utils";

export async function connectDatabase(url: string): Promise<void> {
    try {
        await mongoose.connect(url, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        } as ConnectOptions);

        Logger.success(`MongoDB Connected: ${mongoose.connection.host}`, "Database");
        sendStatus("HEALTHY", "Database Connected", `Successfully connected to the server`);
    } catch (error) {
        handleError(new BotError("Failed to connect to MongoDB", "DATABASE"), "database/connection");
        sendStatus("OFFLINE", "Database Connection Failed", `Could not connect to the database`);
        process.exit(1);
    }
}

mongoose.connection.on("error", (err) => {
    handleError(new BotError(err.message, "DATABASE"), "mongoose");
    sendStatus("OFFLINE", "Database Error", `An error occurred with the database connection`);
});

mongoose.connection.on("disconnected", () => {
    Logger.warn("MongoDB disconnected", "Database");
    sendStatus("DEGRADED", "Database Disconnected", "Connection to the database was lost");
});

process.on("SIGINT", async () => {
    await mongoose.connection.close();
    Logger.info("MongoDB connection closed (app termination)", "Database");
    sendStatus("OFFLINE", "Database Connection Closed", "Application is terminating");
    process.exit(0);
});
