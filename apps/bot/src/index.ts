import { ClientManager } from "@core/client-manager";
import { connectDatabase } from "@database/connection";
import { Logger } from "@logger";
import { SUPER_ADMIN_ID } from "@constants";
import { SuperUserRepository } from "@database/repositories";
import { AllowedGuildRepository } from "@database/repositories";

await connectDatabase(process.env.MONGODB_URI!);
await Promise.all([SuperUserRepository.preload(), AllowedGuildRepository.preload()]);

if (!SUPER_ADMIN_ID) {
    Logger.warn("BOT_OWNER_ID is not set — no user holds the owner bypass. Admin-scoped commands are reachable only by /whitelist super users.");
}

const manager = ClientManager.getInstance();
manager.setBotModulesRoot(import.meta.dir);

await manager.start();
Logger.success("Bot initialized.");
