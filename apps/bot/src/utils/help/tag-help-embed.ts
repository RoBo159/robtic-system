import { EmbedBuilder } from "discord.js";
import { COLORS, TAG_HELP } from "@constants";

export function tagHelpEmbed(tagList: string, variablesList: string): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(TAG_HELP.title)
        .setColor(COLORS.info)
        .addFields(
            { name: TAG_HELP.usageFieldName, value: TAG_HELP.usageFieldValue },
            { name: TAG_HELP.availableTagsFieldName, value: tagList },
            { name: TAG_HELP.templateVariablesFieldName, value: variablesList },
        )
        .setTimestamp();
}
