/** DM text sent by the streak scheduler. */
export const STREAK_DM_MESSAGES = {
    expired: (lostStreak: number) =>
        `💔 لقد انتهى تتابعك.\n\nالتتابع المفقود: ${lostStreak}\n\nيمكن لأحد المشرفين استرجاعه خلال 3 أيام.`,
    expiringSoon: "⚠️ سينتهي تتابعك خلال أقل من ساعتين.\n\nأرسل رسالة واحدة في قناة التتابع للحفاظ عليه.",
} as const;

/** Public streak announcements. Arabic to match the rest of the streak surface. */
export const STREAK_MESSAGES = {
    reached: (userId: string, current: number, best: number) =>
        `🔥 <@${userId}> وصل إلى **${current}** يوم تتابع!` +
        (current >= best ? ` — رقم قياسي جديد! 🏆` : ` (أفضل رقم: **${best}**)`) +
        `\nعُد غداً لمواصلة تتابعك.`,
} as const;

/** Public level-up announcements from the XP system. */
export const LEVEL_UP_MESSAGES = {
    reached: (userId: string, level: number) => `📈 <@${userId}> وصل إلى **المستوى ${level}**! تهانينا 🎉`,
} as const;
