import { ClientManager } from "@core/ClientManager";
import { connectDatabase } from "@database/connection";
import { Logger } from "@core/libs";

await connectDatabase(process.env.MONGODB_URI!);

const manager = ClientManager.getInstance();
await manager.startAll().then(() => {
    Logger.success("All bots initialized.");
})

