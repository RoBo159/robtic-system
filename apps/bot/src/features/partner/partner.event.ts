import { Events } from "discord.js";
import type { EventConfig } from "@typings/event";
import { onMemberAdd } from "./functions/on-member-add";

export default {
    name: Events.GuildMemberAdd,
    execute: member => onMemberAdd(member),
} satisfies EventConfig<Events.GuildMemberAdd>;
