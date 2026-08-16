import { Events } from "discord.js";
import type { EventConfig } from "@typings/event";
import { onStreakMessage } from "./functions/on-streak-message";
import { onTimeoutReset } from "./functions/on-timeout-reset";
import { onKickReset } from "./functions/on-kick-reset";
import { startStreakScheduler } from "./functions/scheduler/start-streak-scheduler";

/**
 * The feature owns its own listeners, including the `clientReady` that starts its scheduler.
 *
 * events/client-ready.ts could have called startStreakScheduler instead, but that would mean a file
 * outside the feature importing from inside it — and deleting `features/streak/` would stop
 * compiling. Several ready listeners doing distinct work is fine; the bug that made this look
 * dangerous was duplicated guild guards, not plurality.
 */
export default [
    {
        name: Events.MessageCreate,
        execute: message => onStreakMessage(message),
    } satisfies EventConfig<Events.MessageCreate>,

    {
        name: Events.GuildMemberUpdate,
        execute: (oldMember, newMember) => onTimeoutReset(oldMember as never, newMember as never),
    } satisfies EventConfig<Events.GuildMemberUpdate>,

    {
        name: Events.GuildMemberRemove,
        execute: member => onKickReset(member as never),
    } satisfies EventConfig<Events.GuildMemberRemove>,

    {
        name: Events.ClientReady,
        once: true,
        execute: client => startStreakScheduler(client),
    } satisfies EventConfig<Events.ClientReady>,
];
