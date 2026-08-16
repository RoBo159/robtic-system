import { MessageFlags } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { streakFeature } from "./streak";
import { view } from "./commands/view";
import { top } from "./commands/top";
import { returnStreak } from "./commands/return-streak";
import { add as rewardAdd } from "./commands/reward/add";
import { remove as rewardRemove } from "./commands/reward/remove";
import { list as rewardList } from "./commands/reward/list";
import { channelAdd } from "./commands/config/channel-add";
import { channelRemove } from "./commands/config/channel-remove";
import { channelList } from "./commands/config/channel-list";
import { channelAnnounce } from "./commands/config/channel-announce";
import { reminderDefault } from "./commands/config/reminder-default";
import { settings } from "./commands/config/settings";
import { windows } from "./commands/config/windows";
import { breakOn } from "./commands/config/break-on";
import { returnRoleAdd, returnRoleRemove, returnRoleList } from "./commands/config/return-role";
import { sync } from "./commands/config/sync";

const rewardHandlers: Record<string, FeatureSubcommandHandler> = {
    add: rewardAdd,
    remove: rewardRemove,
    list: rewardList,
};

/** Keyed `group:subcommand`, with a bare subcommand name when there is no group. */
const configHandlers: Record<string, FeatureSubcommandHandler> = {
    "channel:add": channelAdd,
    "channel:remove": channelRemove,
    "channel:list": channelList,
    "channel:announce": channelAnnounce,
    "reminder:default": reminderDefault,
    settings,
    windows,
    "break-on": breakOn,
    "return-role:add": returnRoleAdd,
    "return-role:remove": returnRoleRemove,
    "return-role:list": returnRoleList,
    sync,
};

/** Both admin commands defer the same way, so the leaf handlers only ever editReply. */
async function deferEphemeral(interaction: CommandInteractionLike): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

export default buildFeatureCommands(streakFeature, {
    streak: view,
    "streak-top": top,
    "streak-return": returnStreak,

    "streak-reward": async (interaction: CommandInteractionLike, client: BotClient) => {
        await deferEphemeral(interaction);
        const handler = rewardHandlers[interaction.options.getSubcommand()];
        if (handler) await handler(interaction, client);
    },

    "streak-config": async (interaction: CommandInteractionLike, client: BotClient) => {
        await deferEphemeral(interaction);
        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();
        const handler = configHandlers[group ? `${group}:${sub}` : sub];
        if (handler) await handler(interaction, client);
    },
}) satisfies CommandConfig[];
