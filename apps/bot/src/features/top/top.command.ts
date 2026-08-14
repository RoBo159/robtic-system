import type { CommandConfig } from "@typings/command";
import { buildFeatureCommands } from "@core/features";
import { topFeature } from "./top";
import { show } from "./commands/show";

/**
 * `/top` has no subcommands, so there is nothing to dispatch on — one runner, named for the command
 * it serves. Features with subcommands map `getSubcommand()` to a file in commands/ instead.
 */
export default buildFeatureCommands(topFeature, { top: show }) satisfies CommandConfig[];
