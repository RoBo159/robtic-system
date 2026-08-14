import type { FeatureSubcommandHandler } from "@typings/feature";
import { AdsConfigRepository } from "@database/repositories";

export const manager: FeatureSubcommandHandler = async (interaction, _client) => {
    const role = interaction.options.getRole("role", true);
    await AdsConfigRepository.setManagerRole(interaction.guildId!, role.id);
    await interaction.editReply({ content: `✅ ${role} يمكنهم الآن قبول/رفض طلبات الإعلانات واستلام تذاكرها.` });
};
