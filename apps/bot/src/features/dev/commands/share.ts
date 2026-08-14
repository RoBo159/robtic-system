import type { FeatureSubcommandHandler } from "@typings/feature";
import { showShareProjectModal } from "../utils/share-modal";

export const share: FeatureSubcommandHandler = async (interaction, _client) => {
    await showShareProjectModal(interaction);
};
