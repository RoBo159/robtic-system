import { Events } from "discord.js";
import type { EventConfig } from "@typings/event";
import { onVoiceStateUpdate } from "./functions/on-voice-state-update";
import { startVoiceScheduler } from "./functions/scheduler/start-voice-scheduler";

export default [
    {
        name: Events.VoiceStateUpdate,
        execute: (oldState, newState) => onVoiceStateUpdate(oldState, newState),
    } satisfies EventConfig<Events.VoiceStateUpdate>,

    {
        name: Events.ClientReady,
        once: true,
        execute: client => startVoiceScheduler(client),
    } satisfies EventConfig<Events.ClientReady>,
];
