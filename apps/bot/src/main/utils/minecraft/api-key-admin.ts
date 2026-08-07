import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { COLORS } from "@constants";
import { PLUGIN_DEFAULT_SCOPES, generateApiKey, hashApiKey } from "@sdk";
import { MinecraftApiKeyRepository } from "@database/repositories";

/**
 * `/minecraft apikey create|list|revoke`.
 *
 * The plaintext key is generated here, hashed, and only the digest is stored — so it is shown to
 * the operator exactly once and can never be recovered afterwards, not even from the database. A
 * lost key is replaced rather than looked up, which is the property that makes a database leak
 * worthless to an attacker.
 *
 * Every reply is ephemeral: the command lives in a staff channel, but a key pasted into channel
 * history would outlive the conversation.
 */
export async function handleApiKeySubcommand(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    sub: string,
): Promise<void> {
    if (sub === "create") {
        const label = interaction.options.getString("label", true).trim();
        const serverId = interaction.options.getString("server", true).trim().toLowerCase();

        const existing = await MinecraftApiKeyRepository.listByGuild(guildId);
        if (existing.some(key => key.label === label && !key.revoked)) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`An active key labelled \`${label}\` already exists. Revoke it first, or pick another label.`)
                        .setColor(COLORS.error),
                ],
            });
            return;
        }

        const key = generateApiKey();

        await MinecraftApiKeyRepository.create({
            guildId,
            keyHash: await hashApiKey(key),
            label,
            serverId,
            scopes: [...PLUGIN_DEFAULT_SCOPES],
            createdBy: interaction.user.id,
        });

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🔑 API Key Created")
                    .setColor(COLORS.success)
                    .setDescription(
                        `**This is the only time this key will be shown.** Copy it now.\n\n` +
                            `\`\`\`\n${key}\n\`\`\``,
                    )
                    .addFields(
                        { name: "Label", value: `\`${label}\``, inline: true },
                        { name: "Server", value: `\`${serverId}\``, inline: true },
                        { name: "Scopes", value: PLUGIN_DEFAULT_SCOPES.join(", "), inline: false },
                        {
                            name: "Next step",
                            value:
                                "Put it in `plugins/RobticMinecraft/api.yml`:\n" +
                                "```yaml\napi:\n  url: \"https://api.robtic.org\"\n  api-key: \"<the key above>\"\n  guild-id: \"" +
                                guildId +
                                "\"\n```\nThen run `/robtic reload` in game — no restart needed.",
                            inline: false,
                        },
                    ),
            ],
        });
        return;
    }

    if (sub === "list") {
        const keys = await MinecraftApiKeyRepository.listByGuild(guildId);

        if (keys.length === 0) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setDescription("No API keys have been issued for this guild.").setColor(COLORS.info)],
            });
            return;
        }

        const lines = keys.map(key => {
            const state = key.revoked ? "🔴 revoked" : "🟢 active";
            const used = key.lastUsedAt ? `<t:${Math.floor(key.lastUsedAt.getTime() / 1000)}:R>` : "never";
            return `${state} • \`${key.label}\` → \`${key.serverId ?? "any"}\` • last used ${used}`;
        });

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🔑 API Keys")
                    .setDescription(lines.join("\n"))
                    .setFooter({ text: "Key values are hashed and cannot be shown again." })
                    .setColor(COLORS.info),
            ],
        });
        return;
    }

    if (sub === "revoke") {
        const label = interaction.options.getString("label", true).trim();
        const revoked = await MinecraftApiKeyRepository.revoke(guildId, label);

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(
                        revoked
                            ? `Revoked \`${label}\`. It stops working within 30 seconds — that is the API's key cache expiring.`
                            : `No key labelled \`${label}\` was found.`,
                    )
                    .setColor(revoked ? COLORS.success : COLORS.error),
            ],
        });
    }
}
