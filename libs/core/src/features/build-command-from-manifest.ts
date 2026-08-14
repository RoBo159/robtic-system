import { SlashCommandBuilder } from "discord.js";
import type { FeatureCommand } from "@typings/feature";
import { applyFeatureOptions } from "./apply-feature-options";

/**
 * Turns one manifest entry into the SlashCommandBuilder Discord registers.
 *
 * Discord forbids mixing bare options with subcommands on the same command, so the three shapes are
 * exclusive: groups win, then subcommands, then plain options.
 */
export function buildCommandFromManifest(command: FeatureCommand): SlashCommandBuilder {
    const builder = new SlashCommandBuilder()
        .setName(command.name)
        .setDescription(command.description);

    if (command.groups?.length) {
        for (const group of command.groups) {
            builder.addSubcommandGroup(groupBuilder => {
                groupBuilder.setName(group.name).setDescription(group.description);
                for (const sub of group.subcommands) {
                    groupBuilder.addSubcommand(subBuilder =>
                        applyFeatureOptions(
                            subBuilder.setName(sub.name).setDescription(sub.description),
                            sub.options,
                        )
                    );
                }
                return groupBuilder;
            });
        }
    }

    if (command.subcommands?.length) {
        for (const sub of command.subcommands) {
            builder.addSubcommand(subBuilder =>
                applyFeatureOptions(
                    subBuilder.setName(sub.name).setDescription(sub.description),
                    sub.options,
                )
            );
        }
    }

    if (!command.groups?.length && !command.subcommands?.length) {
        applyFeatureOptions(builder, command.options);
    }

    return builder;
}
