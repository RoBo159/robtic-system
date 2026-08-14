import { Events } from "discord.js";
import type { EventConfig } from "@typings/event";
import { onComboMessage } from "./functions/on-combo-message";
import { startComboScheduler } from "./functions/scheduler";

export default [
    {
        name: Events.MessageCreate,
        execute: message => onComboMessage(message),
    } satisfies EventConfig<Events.MessageCreate>,

    {
        name: Events.ClientReady,
        once: true,
        execute: client => startComboScheduler(client),
    } satisfies EventConfig<Events.ClientReady>,
];
