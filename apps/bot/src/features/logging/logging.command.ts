import type { CommandConfig } from "@typings/command";
import { buildFeatureCommands } from "@core/features";
import { loggingFeature } from "./logging";
import { setup } from "./commands/setup";

export default buildFeatureCommands(loggingFeature, { "setup-log": setup }) satisfies CommandConfig[];
