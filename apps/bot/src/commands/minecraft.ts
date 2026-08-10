import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ChannelType,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import {
    COLORS,
    MINECRAFT_HISTORY_DEFAULT_LIMIT,
    MINECRAFT_PRICE_LIMITS,
    MINECRAFT_ROLE_MAPPINGS_MAX,
    MINECRAFT_SELLABLE_ITEMS,
} from "@constants";
import { STAFF_ACTIONS } from "@sdk";
import { handleApiKeySubcommand } from "../utils/minecraft/api-key-admin";
import {
    getItemPrices,
    getMinecraftProfile,
    redeemLinkCode,
    removeItemPrice,
    setItemEnabled,
    setItemPrice,
    syncMemberPermissions,
    unlinkAccount,
} from "@core/minecraft";
import {
    MinecraftConfigRepository,
    MinecraftLinkRepository,
    MinecraftServerRepository,
    MinecraftTransactionRepository,
    UserRepository,
} from "@database/repositories";
import { refreshStatusPanel } from "../services/minecraft";
import {
    buildConfigEmbed,
    buildHistoryEmbed,
    buildPriceEmbed,
    buildProfileEmbed,
    buildServerStatusEmbed,
    isMinecraftAdmin,
} from "../utils/minecraft";

const ITEM_CHOICES = MINECRAFT_SELLABLE_ITEMS.map(item => ({ name: item.label, value: item.key }));

/**
 * Gates the admin-only branches. `/minecraft link` and `/minecraft profile` stay open to everyone,
 * so the command itself carries no `requiredPermission` and each branch checks for itself.
 */
async function requireAdmin(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const member = interaction.member as GuildMember | null;
    if (await isMinecraftAdmin(interaction.user.id, member)) return true;

    await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription("You do not have permission to manage the Minecraft integration.").setColor(COLORS.error)],
    });
    return false;
}

export default {
    category: "Minecraft",
    data: new SlashCommandBuilder()
        .setName("minecraft")
        .setDescription("Minecraft account linking, economy, and server management")

        .addSubcommand(sub =>
            sub
                .setName("link")
                .setDescription("Link your Minecraft account using the code shown in-game")
                .addStringOption(opt =>
                    opt.setName("code").setDescription("The code printed by /link on the server").setRequired(true).setMinLength(4).setMaxLength(12)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("unlink")
                .setDescription("Remove a Minecraft account link")
                .addUserOption(opt =>
                    opt.setName("user").setDescription("Member to unlink (staff only, defaults to yourself)").setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("profile")
                .setDescription("Show a member's Minecraft link, balance, and recent sales")
                .addUserOption(opt =>
                    opt.setName("user").setDescription("The member to check (defaults to yourself)").setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName("status").setDescription("Show the current Minecraft server status")
        )
        .addSubcommand(sub =>
            sub
                .setName("history")
                .setDescription("Recent ore-exchange transactions")
                .addUserOption(opt =>
                    opt.setName("user").setDescription("Limit to one member").setRequired(false)
                )
                .addIntegerOption(opt =>
                    opt.setName("limit").setDescription("How many rows to show (1-25)").setMinValue(1).setMaxValue(25).setRequired(false)
                )
        )

        

        
        .addSubcommandGroup(group =>
            group
                .setName("apikey")
                .setDescription("Manage the API keys your Minecraft servers authenticate with")
                .addSubcommand(sub =>
                    sub
                        .setName("create")
                        .setDescription("Issue a new API key for a Minecraft server")
                        .addStringOption(opt =>
                            opt.setName("label").setDescription("A name for this key, e.g. survival-01").setRequired(true).setMaxLength(48)
                        )
                        .addStringOption(opt =>
                            opt.setName("server").setDescription("Server id this key may act for, e.g. survival").setRequired(true).setMaxLength(32)
                        )
                )
                .addSubcommand(sub => sub.setName("list").setDescription("List the API keys issued for this guild"))
                .addSubcommand(sub =>
                    sub
                        .setName("revoke")
                        .setDescription("Revoke an API key immediately")
                        .addStringOption(opt =>
                            opt.setName("label").setDescription("The key's label").setRequired(true).setMaxLength(48)
                        )
                )
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        if (!interaction.guildId || !interaction.guild) {
            await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildId = interaction.guildId;
        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();

        if (group === "apikey") {
            if (!(await requireAdmin(interaction))) return;
            await handleApiKeySubcommand(interaction, guildId, sub);
            return;
        }

        

        

        if (sub === "link") {
            const code = interaction.options.getString("code", true);
            const result = await redeemLinkCode(guildId, interaction.user.id, code);

            if (!result.ok) {
                const messages: Record<typeof result.reason, string> = {
                    invalid_code: "That code is invalid or has expired. Run `/link` again in-game for a fresh one.",
                    discord_already_linked: `Your Discord account is already linked to \`${result.minecraftUsername}\`. Use \`/minecraft unlink\` first.`,
                    uuid_already_linked: `\`${result.minecraftUsername}\` is already linked to another Discord account.`,
                };

                await interaction.editReply({
                    embeds: [new EmbedBuilder().setDescription(messages[result.reason]).setColor(COLORS.error)],
                });
                return;
            }

            const member = interaction.member as GuildMember | null;
            if (member) await syncMemberPermissions(member, "linked");

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle("✅ Minecraft account linked")
                    .setDescription(
                        `Linked to \`${result.minecraftUsername}\` on **${result.serverKey}**.\n\n` +
                        "Your coins are now shared between Discord and Minecraft — use `/coins` here or in-game."
                    )
                    .setColor(COLORS.success)
                    .setTimestamp()],
            });
            return;
        }

        if (sub === "unlink") {
            const target = interaction.options.getUser("user");
            const isSelf = !target || target.id === interaction.user.id;

            if (!isSelf && !(await requireAdmin(interaction))) return;

            const targetId = target?.id ?? interaction.user.id;
            const result = await unlinkAccount(guildId, targetId);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setDescription(result.unlinked
                        ? `Unlinked \`${result.minecraftUsername}\`${isSelf ? "" : ` from <@${targetId}>`}. Synced LuckPerms groups have been removed.`
                        : `${isSelf ? "You have" : `<@${targetId}> has`} no linked Minecraft account.`)
                    .setColor(result.unlinked ? COLORS.success : COLORS.warning)],
            });
            return;
        }

        if (sub === "profile") {
            const target = interaction.options.getUser("user") ?? interaction.user;
            const profile = await getMinecraftProfile(guildId, target.id);
            const displayName = await UserRepository.getDisplayName(target.id) ?? target.username;

            await interaction.editReply({ embeds: [buildProfileEmbed(target, displayName, profile)] });
            return;
        }

        if (sub === "status") {
            const servers = await MinecraftServerRepository.list(guildId);
            const linkCount = await MinecraftLinkRepository.countGuild(guildId);
            const embed = buildServerStatusEmbed(servers);

            if (servers.length > 0) {
                embed.addFields({ name: "Linked accounts", value: `\`${linkCount}\``, inline: true });
            }

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // sub === "history"
        const target = interaction.options.getUser("user");
        const limit = interaction.options.getInteger("limit") ?? MINECRAFT_HISTORY_DEFAULT_LIMIT;

        if (target && target.id !== interaction.user.id && !(await requireAdmin(interaction))) return;

        const transactions = target
            ? await MinecraftTransactionRepository.listByUser(guildId, target.id, limit)
            : await MinecraftTransactionRepository.listByGuild(guildId, limit);

        const title = target ? `🧾 Sales — ${target.username}` : "🧾 Recent Ore Exchange Sales";
        await interaction.editReply({ embeds: [buildHistoryEmbed(title, transactions)] });
    },
};
