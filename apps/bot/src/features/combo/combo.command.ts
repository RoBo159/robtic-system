import type { CommandConfig } from "@typings/command";
import { buildFeatureCommands } from "@core/features";
import { comboFeature } from "./combo";
import { status } from "./commands/status";

export default buildFeatureCommands(comboFeature, { combo: status }) satisfies CommandConfig[];
