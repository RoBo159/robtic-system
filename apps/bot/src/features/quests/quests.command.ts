import { MessageFlags, type AutocompleteInteraction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { QUEST_MESSAGES } from "@constants";
import { buildFeatureCommands } from "@core/features";
import { questsFeature } from "./quests";
import { board } from "./commands/board";
import { active } from "./commands/active";
import { community } from "./commands/community";
import { stats } from "./commands/stats";
import { top } from "./commands/top";
import { post } from "./commands/post";
import { channelDaily, channelCommunity, channelVip } from "./commands/config/channel";
import { mentionSet, mentionList } from "./commands/config/mention";
import { vipRoleAdd, vipRoleRemove, vipRoleList } from "./commands/config/vip-role";
import { windowAdd, windowRemove, windowList, windowKeys } from "./commands/config/window";
import { tierToggle } from "./commands/config/tier";
import { offset } from "./commands/config/offset";
import { communitySettings } from "./commands/config/community";
import { status } from "./commands/config/status";

/** Exported so scripts/quest-wiring-check.ts can prove every manifest leaf is routable. */
export const questHandlers: Record<string, FeatureSubcommandHandler> = {
    board,
    active,
    community,
    stats,
    top,
    post,
};

/**
 * Which answers are worth showing the channel.
 *
 * The community challenge and the leaderboard are about the server, and hiding them turns a
 * conversation starter into a private lookup. Everything else is one member's own state.
 */
const PUBLIC_SUBCOMMANDS = new Set(["community", "top"]);

/** Keyed `group:subcommand`, with a bare subcommand name when there is no group. */
export const configHandlers: Record<string, FeatureSubcommandHandler> = {
    "channel:daily": channelDaily,
    "channel:community": channelCommunity,
    "channel:vip": channelVip,
    "mention:set": mentionSet,
    "mention:list": mentionList,
    "vip-role:add": vipRoleAdd,
    "vip-role:remove": vipRoleRemove,
    "vip-role:list": vipRoleList,
    "window:add": windowAdd,
    "window:remove": windowRemove,
    "window:list": windowList,
    "tier:toggle": tierToggle,
    offset,
    community: communitySettings,
    status,
};

/**
 * Runs a leaf handler, or says so when there isn't one.
 *
 * A missing route leaves an already-deferred interaction spinning until Discord times it out, which
 * looks like the bot hanging rather than like the manifest and the handler map having drifted
 * apart. Saying it out loud costs nothing and makes the gap findable.
 */
async function route(
    interaction: CommandInteractionLike,
    client: BotClient,
    handler: FeatureSubcommandHandler | undefined,
): Promise<void> {
    if (!handler) {
        await interaction.editReply({ content: QUEST_MESSAGES.notWired });
        return;
    }

    await handler(interaction, client);
}

export default buildFeatureCommands(questsFeature, {
    quest: async (interaction: CommandInteractionLike, client: BotClient) => {
        const sub = interaction.options.getSubcommand();

        await interaction.deferReply(
            PUBLIC_SUBCOMMANDS.has(sub) ? {} : { flags: MessageFlags.Ephemeral }
        );

        await route(interaction, client, questHandlers[sub]);
    },

    "quest-config": {
        run: async (interaction: CommandInteractionLike, client: BotClient) => {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const group = interaction.options.getSubcommandGroup(false);
            const sub = interaction.options.getSubcommand();

            await route(interaction, client, configHandlers[group ? `${group}:${sub}` : sub]);
        },

        autocomplete: async (interaction: AutocompleteInteraction) => {
            const focused = interaction.options.getFocused(true);
            if (focused.name !== "key") return;

            const keys = await windowKeys(interaction.guildId!);
            const matches = keys
                .filter(key => key.toLowerCase().includes(focused.value.toLowerCase()))
                .slice(0, 25);

            await interaction.respond(matches.map(key => ({ name: key, value: key })));
        },
    },
}) satisfies CommandConfig[];
