import type { GuildMember } from "discord.js";
import { SUPER_ADMIN_ID } from "@constants";
import { SuperUserRepository } from "@database/repositories";
import { isAnyManager } from "@shared/utils/access";

/** Who may manage prices, integration settings, and other members' links. */
export async function isMinecraftAdmin(userId: string, member: GuildMember | null): Promise<boolean> {
    if (userId === SUPER_ADMIN_ID) return true;
    if (await SuperUserRepository.isWhitelisted(userId)) return true;
    return member ? isAnyManager(member) : false;
}
