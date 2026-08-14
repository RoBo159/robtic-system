import { EmbedBuilder, type User } from "discord.js";
import type { IStreak } from "@database/models";
import { COLORS } from "@constants";

export async function sendStreakDM(user: User, streak: IStreak): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle("🔥 تم تحديث التتابع اليومي!")
        .addFields(
            { name: "التتابع الحالي", value: `${streak.currentStreak}`, inline: true },
            { name: "أفضل تتابع", value: `${streak.bestStreak}`, inline: true },
        )
        .setDescription("التتابع القادم متاح غداً.")
        .setColor(COLORS.activity)
        .setTimestamp();

    await user.send({ embeds: [embed] }).catch(() => null);
}
