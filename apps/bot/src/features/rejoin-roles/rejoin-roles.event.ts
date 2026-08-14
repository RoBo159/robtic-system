import { Events } from "discord.js";
import type { EventConfig } from "@typings/event";
import { saveRolesOnLeave } from "./functions/save-roles-on-leave";
import { restoreRolesOnJoin } from "./functions/restore-roles-on-join";
import { startRejoinRolesScheduler } from "./functions/scheduler/start-cleanup-scheduler";

export default [
    {
        name: Events.GuildMemberRemove,
        execute: member => saveRolesOnLeave(member),
    } satisfies EventConfig<Events.GuildMemberRemove>,

    {
        name: Events.GuildMemberAdd,
        execute: member => restoreRolesOnJoin(member),
    } satisfies EventConfig<Events.GuildMemberAdd>,

    {
        name: Events.ClientReady,
        once: true,
        execute: client => startRejoinRolesScheduler(client),
    } satisfies EventConfig<Events.ClientReady>,
];
