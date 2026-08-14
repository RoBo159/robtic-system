import type { GuildMember } from "discord.js";
import { isManager } from "@bot/utils/access";

/** Manager+ (and full-power) are exempt from the proof-of-evidence requirement. */
export async function needsProof(member: GuildMember): Promise<boolean> {
    return !(await isManager(member));
}
