import { MessageFlags, type AutocompleteInteraction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { PremiumRepository } from "@database/repositories";
import { allPremiumFeatures, premiumFeaturesByModule } from "@core/premium";
import { premiumFeature } from "./premium";
import { view, tiers } from "./commands/view";
import { roleAdd, roleRemove, roleList } from "./commands/role";
import { toggle, status } from "./commands/status";
import { tierCreate, tierDelete, tierEdit, tierList } from "./commands/tier";
import { featureSet, featureClear, featureList } from "./commands/feature";
import { grant, revoke, memberships, holders } from "./commands/membership";

export const memberHandlers: Record<string, FeatureSubcommandHandler> = { view, tiers };

/** A server's own configuration. Keyed `group:subcommand`, bare when there is no group. */
export const configHandlers: Record<string, FeatureSubcommandHandler> = {
    "role:add": roleAdd,
    "role:remove": roleRemove,
    "role:list": roleList,
    toggle,
    status,
};

/** The global ladder and memberships — bot operators only. */
export const adminHandlers: Record<string, FeatureSubcommandHandler> = {
    "tier:create": tierCreate,
    "tier:delete": tierDelete,
    "tier:edit": tierEdit,
    "tier:list": tierList,
    "feature:set": featureSet,
    "feature:clear": featureClear,
    "feature:list": featureList,
    "membership:grant": grant,
    "membership:revoke": revoke,
    "membership:view": memberships,
    "membership:holders": holders,
};

async function route(
    interaction: CommandInteractionLike,
    client: BotClient,
    handler: FeatureSubcommandHandler | undefined,
): Promise<void> {
    if (!handler) {
        await interaction.editReply({ content: "That subcommand is not wired up yet." });
        return;
    }

    await handler(interaction, client);
}

const grouped = (interaction: CommandInteractionLike): string => {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    return group ? `${group}:${sub}` : sub;
};

/**
 * Autocomplete for the three things nobody should have to memorise: the tier keys, the registered
 * perk keys, and which system each perk belongs to.
 *
 * Shared by both admin surfaces — the tier list is global, so the same completion is correct in a
 * server's config command and in the operator's.
 */
async function complete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    const query = focused.value.toLowerCase();

    if (focused.name === "tier") {
        const rows = await PremiumRepository.listTiers();
        const matches = rows
            .filter(tier => tier.key.includes(query) || tier.name.toLowerCase().includes(query))
            .slice(0, 25);

        await interaction.respond(matches.map(tier => ({
            name: `${tier.emoji} ${tier.name} (rank ${tier.rank})`.slice(0, 100),
            value: tier.key,
        })));
        return;
    }

    if (focused.name === "feature") {
        const matches = allPremiumFeatures()
            .filter(def => def.key.toLowerCase().includes(query) || def.description.toLowerCase().includes(query))
            .slice(0, 25);

        await interaction.respond(matches.map(def => ({
            name: `${def.key} — ${def.description}`.slice(0, 100),
            value: def.key,
        })));
        return;
    }

    if (focused.name === "module") {
        const matches = [...premiumFeaturesByModule().keys()].filter(module => module.includes(query)).slice(0, 25);
        await interaction.respond(matches.map(module => ({ name: module, value: module })));
    }
}

export default buildFeatureCommands(premiumFeature, {
    premium: async (interaction: CommandInteractionLike, client: BotClient) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await route(interaction, client, memberHandlers[interaction.options.getSubcommand()]);
    },

    "premium-config": {
        run: async (interaction: CommandInteractionLike, client: BotClient) => {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await route(interaction, client, configHandlers[grouped(interaction)]);
        },
        autocomplete: complete,
    },

    "premium-admin": {
        run: async (interaction: CommandInteractionLike, client: BotClient) => {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await route(interaction, client, adminHandlers[grouped(interaction)]);
        },
        autocomplete: complete,
    },
}) satisfies CommandConfig[];
