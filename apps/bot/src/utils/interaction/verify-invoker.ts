import { MessageFlags, type GuildMember } from "discord.js";
import type { ComponentInteraction } from "@typings/command";
import { getUserLang, t } from "@bot/utils/lang";

/**
 * Guards a panel whose custom id carries the id of whoever opened it.
 *
 * Ownership lives in the custom id rather than in memory, so a panel keeps working across
 * restarts — the trade is that anyone can click it, which is what this refuses.
 */
export async function verifyInvoker(interaction: ComponentInteraction, invokerId: string): Promise<boolean> {
    if (interaction.user.id === invokerId) return true;

    const lang = await getUserLang(interaction.member as GuildMember | null);
    await interaction.reply({ content: t("common.not_your_panel", lang), flags: MessageFlags.Ephemeral }).catch(() => null);
    return false;
}
