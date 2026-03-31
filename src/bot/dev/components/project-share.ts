import { Logger } from "@core/libs";
import { MessageFlags, ModalSubmitInteraction, GuildMember, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { isOwner, hasFullPower, isInDepartment } from "@shared/utils/access";
import { buildProjectContainer } from "@bot/dev/utils/project-flow";

export default {
    customId: "shareProject",
    async run(interaction: ModalSubmitInteraction) {
        if(!interaction.isModalSubmit()) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        Logger.debug(`Received modal submission for shareProject from ${interaction.user.tag}`, "DevBot");
        
        const title = interaction.fields.getTextInputValue("title");
        const description = interaction.fields.getTextInputValue("description");
let typeStr = "other";
        try {
            const typeValues = interaction.fields.getStringSelectValues("type");
            typeStr = (typeValues && typeValues.length > 0) ? typeValues[0] : "other"; 
        } catch {
            typeStr = interaction.fields.getTextInputValue("type") || "other";
        }
        
        let link = interaction.fields.getTextInputValue("link") || "";
        
        // Link safety check (basic URL regex)
        if (link && !link.match(/^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/)) {
            link = "";
        }

        const validTypes = ["web", "discord", "other"] as const;
        const loweredType = typeStr.toLowerCase();
        const normalizedType: "web" | "discord" | "other" = validTypes.includes(loweredType as "web" | "discord" | "other")
            ? (loweredType as "web" | "discord" | "other")
            : "other";

        const member = interaction.member as GuildMember;
        let pType: "member" | "developer" | "system" = "member";
        let isSystem = isOwner(member) || hasFullPower(member);
        
        if (isSystem) {
            pType = "system"; // Will ask in next step
        } else if (isInDepartment(member, "Dev")) {
            pType = "developer";
        }

        const newPending = await ProjectShareRepository.createPending({

            userId: interaction.user.id,
            type: pType,
            projectId: Math.random().toString(36).substring(2, 10),
            projectType: normalizedType,
            projectTitle: title,
            projectDescription: description,
            projectLinks: {
                github: link.includes("github.com") ? link : undefined,
                other: !link.includes("github.com") && link ? link : undefined
            }
        });

        if (isSystem) {
            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`project_sys_type_${newPending._id}`)
                        .setPlaceholder("Select sharing type...")
                        .addOptions([
                            { label: "Share as Member", value: "member" },
                            { label: "Share as Dev Staff", value: "developer" },
                            { label: "Share as System", value: "system" }
                        ])
                );
            
            const embed = new EmbedBuilder()
                .setTitle("Select Project Share Type")
                .setDescription("You have high-level permissions. How would you like to share this project?")
                .setColor("Blurple");

            await interaction.followUp({ embeds: [embed], components: [row] });
            return;
        }

        const container = await buildProjectContainer(newPending._id.toString(), member);
        if (container) {
            await interaction.followUp({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    }
}
