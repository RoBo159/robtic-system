import type { GuildMember } from "discord.js";
import { isAnyManager } from "@bot/utils/access";

/** Manager+ (and full-power) are exempt from the proof-of-evidence requirement. */
export async function needsProof(member: GuildMember): Promise<boolean> {
    return !(await isAnyManager(member));
}
