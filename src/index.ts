import { ClientManager } from "@core/ClientManager";
import { connectDatabase } from "@database/connection";
import { startApiServer } from "./api/server";
import { Logger } from "@core/libs";

await connectDatabase(process.env.MONGODB_URI!);

startApiServer();

const manager = ClientManager.getInstance();
await manager.startAll().then(() => {
    Logger.success("All bots initialized.");
})

