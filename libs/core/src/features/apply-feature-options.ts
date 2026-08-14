import type {
    SlashCommandBuilder,
    SlashCommandSubcommandBuilder,
} from "discord.js";
import type { FeatureOption } from "@typings/feature";

/** The two builder shapes an option can be attached to — a top-level command or one subcommand. */
type OptionTarget = SlashCommandBuilder | SlashCommandSubcommandBuilder;

/**
 * Attaches a manifest's options to a builder, in declaration order.
 *
 * Order matters beyond aesthetics: the prefix parser consumes positional arguments in the order the
 * builder reports them, so `!coins add @user 5` only maps correctly while the manifest and the
 * builder agree.
 */
export function applyFeatureOptions<T extends OptionTarget>(builder: T, options: readonly FeatureOption[] | undefined): T {
    if (!options?.length) return builder;

    for (const option of options) {
        switch (option.type) {
            case "string":
                builder.addStringOption(opt => {
                    opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false);
                    if (option.choices?.length) {
                        opt.addChoices(...option.choices.map(c => ({ name: c.name, value: String(c.value) })));
                    }
                    if (option.autocomplete) opt.setAutocomplete(true);
                    return opt;
                });
                break;

            case "integer":
                builder.addIntegerOption(opt => {
                    opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false);
                    if (option.minValue !== undefined) opt.setMinValue(option.minValue);
                    if (option.maxValue !== undefined) opt.setMaxValue(option.maxValue);
                    if (option.choices?.length) {
                        opt.addChoices(...option.choices.map(c => ({ name: c.name, value: Number(c.value) })));
                    }
                    if (option.autocomplete) opt.setAutocomplete(true);
                    return opt;
                });
                break;

            case "number":
                builder.addNumberOption(opt => {
                    opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false);
                    if (option.minValue !== undefined) opt.setMinValue(option.minValue);
                    if (option.maxValue !== undefined) opt.setMaxValue(option.maxValue);
                    if (option.autocomplete) opt.setAutocomplete(true);
                    return opt;
                });
                break;

            case "boolean":
                builder.addBooleanOption(opt =>
                    opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false)
                );
                break;

            case "user":
                builder.addUserOption(opt =>
                    opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false)
                );
                break;

            case "role":
                builder.addRoleOption(opt =>
                    opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false)
                );
                break;

            case "channel":
                builder.addChannelOption(opt => {
                    opt.setName(option.name).setDescription(option.description).setRequired(option.required ?? false);
                    if (option.channelTypes?.length) {
                        opt.addChannelTypes(...option.channelTypes);
                    }
                    return opt;
                });
                break;
        }
    }

    return builder;
}
