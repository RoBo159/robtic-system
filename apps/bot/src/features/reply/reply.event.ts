import { Events } from "discord.js";
import type { EventConfig } from "@typings/event";
import { onTriggerMessage } from "./functions/on-trigger-message";

export default {
    name: Events.MessageCreate,
    execute: message => onTriggerMessage(message),
} satisfies EventConfig<Events.MessageCreate>;
