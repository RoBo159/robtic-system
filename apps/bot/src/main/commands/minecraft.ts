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
                .setName("price")
                .setDescription("Manage ore-exchange prices")
                .addSubcommand(sub =>
                    sub
                        .setName("set")
                        .setDescription("Set the coins paid per unit of an item")
                        .addStringOption(opt =>
                            opt.setName("item").setDescription("Item to price").setRequired(true).addChoices(...ITEM_CHOICES)
                        )
                        .addIntegerOption(opt =>
                            opt
                                .setName("coins")
                                .setDescription("Coins paid per unit")
                                .setRequired(true)
                                .setMinValue(MINECRAFT_PRICE_LIMITS.min)
                                .setMaxValue(MINECRAFT_PRICE_LIMITS.max)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("remove")
                        .setDescription("Remove a price override, restoring the catalog default")
                        .addStringOption(opt =>
                            opt.setName("item").setDescription("Item to reset").setRequired(true).addChoices(...ITEM_CHOICES)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("toggle")
                        .setDescription("Show or hide an item in the in-game exchange")
                        .addStringOption(opt =>
                            opt.setName("item").setDescription("Item to toggle").setRequired(true).addChoices(...ITEM_CHOICES)
                        )
                        .addBooleanOption(opt =>
                            opt.setName("enabled").setDescription("Whether the item can be sold").setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("list").setDescription("Show the full price table")
                )
        )

        .addSubcommandGroup(group =>
            group
                .setName("config")
                .setDescription("Configure the Minecraft integration")
                .addSubcommand(sub =>
                    sub.setName("view").setDescription("Show the current integration settings")
                )
                .addSubcommand(sub =>
                    sub
                        .setName("status-channel")
                        .setDescription("Set the channel hosting the server status panel")
                        .addChannelOption(opt =>
                            opt.setName("channel").setDescription("Leave empty to clear").addChannelTypes(ChannelType.GuildText).setRequired(false)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("chat-channel")
                        .setDescription("Set the channel bridged to in-game chat")
                        .addChannelOption(opt =>
                            opt.setName("channel").setDescription("Leave empty to clear").addChannelTypes(ChannelType.GuildText).setRequired(false)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("toggle")
                        .setDescription("Enable or disable the chat bridge and role sync")
                        .addBooleanOption(opt =>
                            opt.setName("chat-bridge").setDescription("Relay messages between Discord and Minecraft").setRequired(false)
                        )
                        .addBooleanOption(opt =>
                            opt.setName("role-sync").setDescription("Synchronise LuckPerms groups from Discord roles").setRequired(false)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("role-map")
                        .setDescription("Map a Discord role to a LuckPerms group")
                        .addRoleOption(opt =>
                            opt.setName("role").setDescription("Discord role").setRequired(true)
                        )
                        .addStringOption(opt =>
                            opt.setName("group").setDescription("LuckPerms group name, e.g. moderator").setRequired(true).setMaxLength(48)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("role-unmap")
                        .setDescription("Remove a Discord role → LuckPerms group mapping")
                        .addRoleOption(opt =>
                            opt.setName("role").setDescription("Discord role").setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("staff-channel")
                        .setDescription("Set the channel bridged to in-game staff chat")
                        .addChannelOption(opt =>
                            opt.setName("channel").setDescription("Staff chat channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("log-channel")
                        .setDescription("Set the default destination for moderation log embeds")
                        .addChannelOption(opt =>
                            opt.setName("channel").setDescription("Log channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("log-action")
                        .setDescription("Send one specific action to its own channel")
                        // Choices rather than autocomplete: there are 23 actions and Discord allows
                        // 25, so the whole list fits and needs no extra interaction handler.
                        .addStringOption(opt =>
                            opt
                                .setName("action")
                                .setDescription("Which action")
                                .setRequired(true)
                                .addChoices(...STAFF_ACTIONS.map(action => ({ name: action, value: action })))
                        )
                        .addChannelOption(opt =>
                            opt.setName("channel").setDescription("Destination channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("staff-rank")
                        .setDescription("Map a Discord role to an in-game staff rank")
                        .addRoleOption(opt =>
                            opt.setName("role").setDescription("Discord staff role").setRequired(true)
                        )
                        .addStringOption(opt =>
                            opt.setName("name").setDescription("Display name, e.g. Moderator").setRequired(true).setMaxLength(32)
                        )
                        .addStringOption(opt =>
                            opt.setName("group").setDescription("LuckPerms group applied in staff mode").setRequired(true).setMaxLength(48)
                        )
                        .addIntegerOption(opt =>
                            opt.setName("priority").setDescription("Lower wins when several are held").setRequired(true).setMinValue(0).setMaxValue(1000)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName("jail-role")
                        .setDescription("Role applied to a linked player while they are jailed")
                        .addRoleOption(opt =>
                            opt.setName("role").setDescription("Jailed role").setRequired(true)
                        )
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

        if (group === "price") {
            if (sub === "list") {
                const entries = await getItemPrices(guildId);
                await interaction.editReply({ embeds: [buildPriceEmbed(interaction.guild.name, entries)] });
                return;
            }

            if (!(await requireAdmin(interaction))) return;

            const itemKey = interaction.options.getString("item", true);

            if (sub === "set") {
                const coins = interaction.options.getInteger("coins", true);
                const result = await setItemPrice(guildId, itemKey, coins, interaction.user.id);

                if (!result.ok) {
                    const message = result.reason === "unknown_item"
                        ? `\`${itemKey}\` is not a sellable item.`
                        : `The price must be between ${MINECRAFT_PRICE_LIMITS.min} and ${MINECRAFT_PRICE_LIMITS.max} coins.`;
                    await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(message).setColor(COLORS.error)] });
                    return;
                }

                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setDescription(`**${result.itemKey}** now pays **${result.price}** 🪙 per unit. The change is live in-game within a few seconds.`)
                        .setColor(COLORS.success)],
                });
                return;
            }

            if (sub === "remove") {
                const removed = await removeItemPrice(guildId, itemKey);
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setDescription(removed
                            ? `Price override for **${itemKey}** removed — it falls back to the catalog default.`
                            : `**${itemKey}** had no price override.`)
                        .setColor(removed ? COLORS.success : COLORS.warning)],
                });
                return;
            }

            // sub === "toggle"
            const enabled = interaction.options.getBoolean("enabled", true);
            const applied = await setItemEnabled(guildId, itemKey, enabled);
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setDescription(applied
                        ? `**${itemKey}** is now **${enabled ? "sellable" : "hidden"}** in the exchange.`
                        : `\`${itemKey}\` is not a sellable item.`)
                    .setColor(applied ? COLORS.success : COLORS.error)],
            });
            return;
        }

        if (group === "config") {
            if (!(await requireAdmin(interaction))) return;

            if (sub === "status-channel" || sub === "chat-channel") {
                const channel = interaction.options.getChannel("channel");
                const config = sub === "status-channel"
                    ? await MinecraftConfigRepository.setStatusChannel(guildId, channel?.id ?? null)
                    : await MinecraftConfigRepository.setChatChannel(guildId, channel?.id ?? null);

                if (sub === "status-channel" && channel) {
                    await refreshStatusPanel(client, guildId);
                }

                await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
                return;
            }

            if (sub === "toggle") {
                const chatBridge = interaction.options.getBoolean("chat-bridge");
                const roleSync = interaction.options.getBoolean("role-sync");

                if (chatBridge === null && roleSync === null) {
                    await interaction.editReply({
                        embeds: [new EmbedBuilder().setDescription("Provide at least one toggle to change.").setColor(COLORS.warning)],
                    });
                    return;
                }

                const config = await MinecraftConfigRepository.setToggles(guildId, {
                    ...(chatBridge === null ? {} : { chatBridgeEnabled: chatBridge }),
                    ...(roleSync === null ? {} : { roleSyncEnabled: roleSync }),
                });

                await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
                return;
            }

            if (sub === "role-map") {
                const role = interaction.options.getRole("role", true);
                const groupName = interaction.options.getString("group", true).trim().toLowerCase();
                const current = await MinecraftConfigRepository.getRoleMappings(guildId);

                if (current.length >= MINECRAFT_ROLE_MAPPINGS_MAX && !current.some(m => m.roleId === role.id)) {
                    await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setDescription(`This server already has the maximum of ${MINECRAFT_ROLE_MAPPINGS_MAX} role mappings.`)
                            .setColor(COLORS.error)],
                    });
                    return;
                }

                const config = await MinecraftConfigRepository.setRoleMapping(guildId, role.id, groupName);
                await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
                return;
            }

            if (sub === "role-unmap") {
                const role = interaction.options.getRole("role", true);
                const config = await MinecraftConfigRepository.removeRoleMapping(guildId, role.id);
                await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
                return;
            }

            if (sub === "staff-channel") {
                const channel = interaction.options.getChannel("channel", true);
                const config = await MinecraftConfigRepository.setStaffChatChannel(guildId, channel.id);
                await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
                return;
            }

            if (sub === "log-channel") {
                const channel = interaction.options.getChannel("channel", true);
                const config = await MinecraftConfigRepository.setDefaultLogChannel(guildId, channel.id);
                await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
                return;
            }

            if (sub === "log-action") {
                const action = interaction.options.getString("action", true);
                const channel = interaction.options.getChannel("channel", true);

                if (!(STAFF_ACTIONS as readonly string[]).includes(action)) {
                    await interaction.editReply({
                        embeds: [new EmbedBuilder().setDescription(`\`${action}\` is not a known staff action.`).setColor(COLORS.error)],
                    });
                    return;
                }

                const config = await MinecraftConfigRepository.setLogTarget(guildId, action, channel.id);
                await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
                return;
            }

            if (sub === "staff-rank") {
                const role = interaction.options.getRole("role", true);
                const config = await MinecraftConfigRepository.setStaffRank(guildId, {
                    roleId: role.id,
                    name: interaction.options.getString("name", true),
                    group: interaction.options.getString("group", true).toLowerCase(),
                    priority: interaction.options.getInteger("priority", true),
                });
                await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
                return;
            }

            if (sub === "jail-role") {
                const role = interaction.options.getRole("role", true);
                const config = await MinecraftConfigRepository.setJailRole(guildId, role.id);
                await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
                return;
            }

            // sub === "view"
            const config = await MinecraftConfigRepository.getOrCreate(guildId);
            await interaction.editReply({ embeds: [buildConfigEmbed(interaction.guild.name, config)] });
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
