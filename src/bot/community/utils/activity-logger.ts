import { EmbedBuilder, type Guild, type TextChannel } from "discord.js";
import { Colors } from "@core/config";
import { Logger } from "@core/libs";
import data from "@shared/data.json";

const CTX = "activity:log";

type ActivityLogChannel =
    | "xp_gain"
    | "rewards"
    | "support_points"
    | "staff_activity"
    | "decay"
    | "ai";

const CHANNEL_MAP: Record<ActivityLogChannel, string> = {
    xp_gain: data.xp_gain_log_channel_id,
    rewards: data.rewards_log_channel_id,
    support_points: data.support_points_log_channel_id,
    staff_activity: data.staff_activity_log_channel_id,
    decay: data.decay_log_channel_id,
    ai: data.ai_log_channel_id,
};

function getLogChannel(guild: Guild, type: ActivityLogChannel): TextChannel | null {
    const channelId = CHANNEL_MAP[type];
    if (!channelId) return null;
    const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
    return channel ?? null;
}

export async function logToChannel(
    guild: Guild,
    type: ActivityLogChannel,
    embed: EmbedBuilder,
): Promise<void> {
    try {
        const channel = getLogChannel(guild, type);
        if (!channel) return;
        await channel.send({ embeds: [embed] });
    } catch (err) {
        Logger.debug(`Failed to send activity log (${type}): ${err}`, CTX);
    }
}

export function xpGainEmbed(username: string, userId: string, xp: number, leveledUp: boolean, newLevel: number): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(leveledUp ? Colors.success : Colors.activity)
        .setTitle(leveledUp ? "⬆️ Level Up!" : "✨ XP Gained")
        .addFields(
            { name: "User", value: `<@${userId}>`, inline: true },
            { name: "XP", value: `+${xp}`, inline: true },
            { name: "Level", value: `${newLevel}`, inline: true },
        )
        .setTimestamp();

    if (leveledUp) {
        embed.setDescription(`**${username}** reached level **${newLevel}**!`);
    }

    return embed;
}

export function supportPointsEmbed(staffId: string, points: number, responseMs: number): EmbedBuilder {
    const seconds = Math.round(responseMs / 1000);
    return new EmbedBuilder()
        .setColor(points >= 0 ? Colors.success : Colors.error)
        .setTitle(points >= 0 ? "🎫 Support Points" : "🎫 Support Penalty")
        .addFields(
            { name: "Staff", value: `<@${staffId}>`, inline: true },
            { name: "Points", value: `${points > 0 ? "+" : ""}${points}`, inline: true },
            { name: "Response Time", value: `${seconds}s`, inline: true },
        )
        .setTimestamp();
}

export function staffActivityEmbed(userId: string, username: string, points: number, channelType: "public" | "staff"): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(Colors.activity)
        .setTitle(`📊 Staff Activity — ${channelType === "staff" ? "Staff Chat" : "Public Chat"}`)
        .addFields(
            { name: "Staff", value: `<@${userId}>`, inline: true },
            { name: "Points", value: `+${points}`, inline: true },
        )
        .setTimestamp();
}

export function supportSessionEmbed(
    action: "created" | "claimed" | "resolved" | "auto-closed",
    userId: string,
    staffId?: string,
    details?: string,
): EmbedBuilder {
    const titles: Record<string, string> = {
        created: "📩 Support Session Created",
        claimed: "🤚 Support Session Claimed",
        resolved: "✅ Support Session Resolved",
        "auto-closed": "⏰ Support Session Auto-Closed",
    };

    const embed = new EmbedBuilder()
        .setColor(action === "resolved" ? Colors.success : action === "auto-closed" ? Colors.warning : Colors.info)
        .setTitle(titles[action])
        .addFields({ name: "User", value: `<@${userId}>`, inline: true })
        .setTimestamp();

    if (staffId) {
        embed.addFields({ name: "Staff", value: `<@${staffId}>`, inline: true });
    }
    if (details) {
        embed.addFields({ name: "Details", value: details });
    }

    return embed;
}

export function aiDecisionEmbed(
    username: string,
    userId: string,
    classification: string,
    confidence: number,
    fallback: boolean,
    context: string,
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(fallback ? Colors.warning : Colors.info)
        .setTitle(`🤖 AI Decision${fallback ? " (Fallback)" : ""}`)
        .addFields(
            { name: "User", value: `<@${userId}>`, inline: true },
            { name: "Classification", value: classification, inline: true },
            { name: "Confidence", value: `${(confidence * 100).toFixed(0)}%`, inline: true },
            { name: "Context", value: context, inline: true },
            { name: "Mode", value: fallback ? "Rule-based" : "AI", inline: true },
        )
        .setTimestamp();
}

export function decayEmbed(userId: string, username: string, xpLost: number, levelDown: boolean, oldLevel: number, newLevel: number): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(levelDown ? Colors.error : Colors.warning)
        .setTitle(levelDown ? "📉 Level Down (Decay)" : "📉 XP Decay")
        .addFields(
            { name: "User", value: `<@${userId}>`, inline: true },
            { name: "XP Lost", value: `-${xpLost}`, inline: true },
            { name: "Level", value: levelDown ? `${oldLevel} → ${newLevel}` : `${newLevel}`, inline: true },
        )
        .setTimestamp();
    return embed;
}

export function staffPenaltyEmbed(staffId: string, points: number, reason: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(Colors.error)
        .setTitle("⚠️ Staff Support Penalty")
        .addFields(
            { name: "Staff", value: `<@${staffId}>`, inline: true },
            { name: "Points", value: `${points}`, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp();
}

export function staffReminderEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(Colors.warning)
        .setTitle("📌 Support Channel Reminder")
        .setDescription(
            "Hey! It looks like you and another staff member have been chatting in a **support channel**.\n\n" +
            "Please keep support channels focused on helping users. Use staff channels for internal discussions.",
        )
        .setTimestamp();
}

export function sorryDmEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(Colors.info)
        .setTitle("💙 We Appreciate Your Patience")
        .setDescription(
            "We're sorry if your recent support experience wasn't the best.\n\n" +
            "Your feedback matters to us — we're always working to improve. " +
            "If you still need help, feel free to reach out again!",
        )
        .setTimestamp();
}

export function ratingFeedbackEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(Colors.success)
        .setTitle("⭐ How Was Your Support Experience?")
        .setDescription(
            "We'd love to hear your feedback!\n\n" +
            "How would you rate the support you received?\n" +
            "Your response helps us improve our service.",
        )
        .setTimestamp();
}

export function dynamicSupportPointsEmbed(
    staffId: string,
    total: number,
    speedPts: number,
    qualityPts: number,
    sentimentPts: number,
    quality: string | null,
    sentiment: string | null,
    responseMs: number,
): EmbedBuilder {
    const seconds = Math.round(responseMs / 1000);
    return new EmbedBuilder()
        .setColor(total >= 0 ? Colors.success : Colors.error)
        .setTitle(total >= 0 ? "🎫 Support Points (Dynamic)" : "🎫 Support Penalty (Dynamic)")
        .addFields(
            { name: "Staff", value: `<@${staffId}>`, inline: true },
            { name: "Total", value: `${total > 0 ? "+" : ""}${total}`, inline: true },
            { name: "Response", value: `${seconds}s → ${speedPts > 0 ? "+" : ""}${speedPts}`, inline: true },
            { name: "Quality", value: `${quality ?? "N/A"} → ${qualityPts > 0 ? "+" : ""}${qualityPts}`, inline: true },
            { name: "Sentiment", value: `${sentiment ?? "N/A"} → ${sentimentPts > 0 ? "+" : ""}${sentimentPts}`, inline: true },
        )
        .setTimestamp();
}
