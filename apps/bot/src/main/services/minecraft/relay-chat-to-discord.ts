import { escapeMarkdown, PermissionFlagsBits, type Client, type Webhook } from "discord.js";
import { MinecraftConfigRepository } from "@database/repositories";
import { MINECRAFT_BRIDGE } from "@constants";
import { Logger } from "@logger";

interface ChatPayload {
    username?: string;
    message?: string;
    serverKey?: string;
    minecraftUuid?: string;
}

/** Name the bridge's own webhook is created under, and how it is recognised again later. */
const WEBHOOK_NAME = "Robtic Minecraft";

/**
 * Webhooks by channel id.
 *
 * Creating one costs an API call and a guild has a hard cap of them per channel, so the handle is
 * kept rather than re-created per message. An entry is dropped on a send failure, which is what
 * recovers from a webhook an admin deleted underneath us.
 */
const webhooks = new Map<string, Webhook>();

/**
 * The face rendered beside the message.
 *
 * mc-heads serves an avatar straight from a uuid with no key and no rate limit worth planning
 * around, and Discord fetches and caches it itself — the bot never downloads a skin.
 */
function avatarUrl(uuid: string): string {
    return `https://mc-heads.net/avatar/${uuid.replace(/-/g, "")}/64`;
}

/**
 * A webhook for the bridged channel, created on first use.
 *
 * Returns null when the bot cannot manage webhooks in that channel, which is an ordinary
 * permission state rather than a fault — the caller falls back to posting as itself.
 */
async function resolveWebhook(
    client: Client,
    channelId: string,
): Promise<{ webhook: Webhook; threadId?: string } | null> {
    const target = await client.channels.fetch(channelId).catch(() => null);
    if (!target?.isTextBased() || target.isDMBased()) return null;

    // A thread cannot own a webhook — its parent does, and the message is aimed back at the thread
    // with `threadId` on send. Bridging into a thread is unusual but costs one branch to support.
    const channel = target.isThread() ? target.parent : target;
    if (!channel || !("createWebhook" in channel)) return null;

    const threadId = target.isThread() ? target.id : undefined;

    const cached = webhooks.get(channel.id);
    if (cached) return { webhook: cached, threadId };

    const me = channel.guild.members.me;
    if (!me?.permissionsIn(channel).has(PermissionFlagsBits.ManageWebhooks)) {
        Logger.warn(
            `Cannot manage webhooks in the bridged channel — Minecraft chat will be posted as the ` +
            `bot instead of as the player. Grant "Manage Webhooks" to relay with player names and skins.`,
            "Minecraft",
        );
        return null;
    }

    const existing = await channel.fetchWebhooks().catch(() => null);
    const reusable = existing?.find(
        (hook: Webhook) => hook.name === WEBHOOK_NAME && hook.owner?.id === client.user?.id,
    );

    const webhook =
        reusable ??
        (await channel
            .createWebhook({ name: WEBHOOK_NAME, reason: "Relaying Minecraft chat with player identities" })
            .catch((error: unknown) => {
                Logger.warn(`Could not create the Minecraft chat webhook: ${error}`, "Minecraft");
                return null;
            }));

    if (!webhook) return null;

    webhooks.set(channel.id, webhook);
    return { webhook, threadId };
}

/**
 * Posts one in-game chat line into the bridged Discord channel.
 *
 * Sent through a webhook so the message carries the player's own name and skin face rather than
 * the bot's — the two sides then read as one conversation instead of a feed of quoted lines.
 * Mentions are disabled either way: a player must not be able to ping the server from Minecraft.
 *
 * The webhook is also what keeps the loop closed. `minecraft-chat-bridge` drops anything carrying
 * a `webhookId`, so a relayed line cannot be picked back up and sent to the game.
 */
export async function relayChatToDiscord(
    client: Client,
    guildId: string,
    payload: Record<string, unknown>,
): Promise<void> {
    const { username, message, minecraftUuid } = payload as ChatPayload;
    if (!username || !message) return;

    const config = await MinecraftConfigRepository.get(guildId);
    if (!config?.chatChannelId || !config.chatBridgeEnabled) return;

    const text = escapeMarkdown(message.slice(0, MINECRAFT_BRIDGE.maxChatLength));
    const resolved = await resolveWebhook(client, config.chatChannelId);

    if (resolved) {
        const sent = await resolved.webhook
            .send({
                content: text,
                // Discord rejects a webhook username containing "discord", and truncates past 80.
                username: username.slice(0, 80).replace(/discord/gi, "d1scord"),
                avatarURL: minecraftUuid ? avatarUrl(minecraftUuid) : undefined,
                threadId: resolved.threadId,
                allowedMentions: { parse: [] },
            })
            .then(() => true)
            .catch((error: unknown) => {
                // Most likely the webhook was deleted in Discord. Forget it so the next message
                // creates a fresh one rather than failing forever against a dead handle.
                webhooks.delete(resolved.webhook.channelId);
                Logger.warn(`Minecraft chat webhook send failed, falling back: ${error}`, "Minecraft");
                return false;
            });

        if (sent) return;
    }

    // Fallback: the original bot-authored form. Used when the bot lacks Manage Webhooks, so a
    // missing permission degrades the presentation rather than dropping the message.
    const channel = await client.channels.fetch(config.chatChannelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable()) return;

    await channel
        .send({
            content: `\`[MC]\` **${escapeMarkdown(username)}** ${text}`,
            allowedMentions: { parse: [] },
        })
        .catch(error => Logger.warn(`Failed to relay Minecraft chat: ${error}`, "Minecraft"));
}
