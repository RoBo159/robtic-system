import type { BotClient } from "@core/BotClient";

interface TagVariableContext {
    userId: string;
    staffId: string;
    client: BotClient;
    guildId?: string;
}

export async function resolveTagVariables(
    content: string,
    ctx: TagVariableContext,
): Promise<string> {
    const user = await ctx.client.users.fetch(ctx.userId).catch(() => null);
    const staff = await ctx.client.users.fetch(ctx.staffId).catch(() => null);
    const guild = ctx.guildId
        ? ctx.client.guilds.cache.get(ctx.guildId) ?? null
        : null;

    const now = Math.floor(Date.now() / 1000);
    const dateStr = new Date().toLocaleDateString("en-GB");

    const variables: Record<string, string> = {
        "{user}": `<@${ctx.userId}>`,
        "{username}": user?.displayName ?? user?.username ?? "Unknown",
        "{userid}": ctx.userId,
        "{usertag}": user?.tag ?? "Unknown",
        "{staff}": `<@${ctx.staffId}>`,
        "{staffname}": staff?.displayName ?? staff?.username ?? "Unknown",
        "{staffid}": ctx.staffId,
        "{server}": guild?.name ?? "Server",
        "{membercount}": guild ? `${guild.memberCount}` : "0",
        "{date}": dateStr,
        "{time}": `<t:${now}>`,
        "{nl}": "\n",
    };

    let result = content;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replaceAll(key, value);
    }

    return result;
}

export const TAG_VARIABLES_LIST = [
    "`{user}` — Mention the user",
    "`{username}` — User's display name",
    "`{userid}` — User's ID",
    "`{usertag}` — User's tag",
    "`{staff}` — Mention the staff member",
    "`{staffname}` — Staff display name",
    "`{staffid}` — Staff ID",
    "`{server}` — Server name",
    "`{membercount}` — Server member count",
    "`{date}` — Current date",
    "`{time}` — Discord timestamp",
    "`{nl}` — New line",
].join("\n");
