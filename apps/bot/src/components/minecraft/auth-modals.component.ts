import { MessageFlags, type ModalSubmitInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { MINECRAFT_AUTH } from "@constants";
import {
    changePassword,
    linkAccountWithPassword,
    unlinkWithPassword,
    type AuthAccountFailure,
    type PasswordProblem,
} from "@core/minecraft";
import { AUTH_FIELD_IDS, AUTH_MODAL_IDS } from "./auth-panel.component";

/**
 * The three modal submissions from the `#link-account` panel.
 *
 * <h2>Every reply is ephemeral, without exception</h2>
 *
 * These carry link codes, recovery codes and the outcome of password operations. None of it belongs
 * in a public channel — and the panel lives in a channel everybody can see, so a non-ephemeral reply
 * would put "your password has been changed" under a message anybody can scroll to.
 *
 * <h2>Failures are named without being useful to an attacker</h2>
 *
 * A wrong password and a missing account produce different sentences, because the person reading
 * them is almost always the account's owner and telling them nothing helps nobody. What is never
 * revealed is anything they could not have known already: no usernames for accounts they do not
 * hold, and no confirmation that a given code exists.
 */

const CTX_FLAGS = MessageFlags.Ephemeral;

/** Turns a validation problem into the sentence the player needs. */
function passwordProblemMessage(problem: PasswordProblem | undefined): string {
    switch (problem) {
        case "too_short":
            return `Your password must be at least ${MINECRAFT_AUTH.password.minLength} characters.`;
        case "too_long":
            return `Your password must be at most ${MINECRAFT_AUTH.password.maxLength} characters.`;
        default:
            return "Your password cannot be blank.";
    }
}

/** Shared failure rendering, so the three modals cannot describe the same refusal differently. */
function failureMessage(reason: AuthAccountFailure, problem?: PasswordProblem, username?: string): string {
    switch (reason) {
        case "invalid_code":
            return "❌ That code is not valid. It may have expired, already been used, or belong to a different Discord account.\n" +
                "Get a fresh one in game and try again.";
        case "discord_already_linked":
            return `❌ Your Discord account is already linked to **${username ?? "a Minecraft account"}**.\n` +
                "Use **Unlink Account** first if you want to link a different one.";
        case "uuid_already_linked":
            return "❌ That Minecraft account is already linked to a different Discord account.";
        case "not_linked":
            return "❌ You do not have a linked Minecraft account.";
        case "wrong_password":
            return "❌ That password is not right.";
        case "no_password":
            return "❌ You have not set a password yet, so there is nothing to confirm.\n" +
                "Use **Forgot Password** on the login screen in game to set one first.";
        case "invalid_password":
            return `❌ ${passwordProblemMessage(problem)}`;
    }
}

export const authLinkModalHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: AUTH_MODAL_IDS.link,

    async run(interaction: ModalSubmitInteraction, _client: BotClient) {
        if (!interaction.guildId) return;

        // Deferred first: hashing a password is deliberately slow — that is what makes it a good
        // hash — and comfortably past Discord's three-second window on its own.
        await interaction.deferReply({ flags: CTX_FLAGS });

        const result = await linkAccountWithPassword({
            guildId: interaction.guildId,
            discordId: interaction.user.id,
            code: interaction.fields.getTextInputValue(AUTH_FIELD_IDS.linkCode),
            password: interaction.fields.getTextInputValue(AUTH_FIELD_IDS.password),
        });

        if (!result.ok) {
            await interaction.editReply({ content: failureMessage(result.reason, result.problem, result.username) });
            return;
        }

        await interaction.editReply({
            content:
                `✅ Linked to **${result.minecraftUsername}**.\n\n` +
                "You can log in now — the game will ask for the password you just chose. " +
                "If you are still in game, you should have been let out of the link world already.",
        });
    },
};

export const authChangePasswordModalHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: AUTH_MODAL_IDS.changePassword,

    async run(interaction: ModalSubmitInteraction, _client: BotClient) {
        if (!interaction.guildId) return;

        await interaction.deferReply({ flags: CTX_FLAGS });

        const result = await changePassword({
            guildId: interaction.guildId,
            discordId: interaction.user.id,
            recoveryCode: interaction.fields.getTextInputValue(AUTH_FIELD_IDS.recoveryCode),
            newPassword: interaction.fields.getTextInputValue(AUTH_FIELD_IDS.newPassword),
        });

        if (!result.ok) {
            await interaction.editReply({ content: failureMessage(result.reason, result.problem, result.username) });
            return;
        }

        await interaction.editReply({
            content:
                `✅ Password changed for **${result.minecraftUsername}**.\n\n` +
                "Every other session has been signed out. If you are in game right now, you have been let in.",
        });
    },
};

export const authUnlinkModalHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: AUTH_MODAL_IDS.unlink,

    async run(interaction: ModalSubmitInteraction, _client: BotClient) {
        if (!interaction.guildId) return;

        await interaction.deferReply({ flags: CTX_FLAGS });

        const result = await unlinkWithPassword({
            guildId: interaction.guildId,
            discordId: interaction.user.id,
            password: interaction.fields.getTextInputValue(AUTH_FIELD_IDS.password),
        });

        if (!result.ok) {
            await interaction.editReply({ content: failureMessage(result.reason, result.problem, result.username) });
            return;
        }

        await interaction.editReply({
            content:
                `✅ Unlinked **${result.minecraftUsername}**.\n\n` +
                "Your password and sessions have been removed. Your robs are untouched — they belong to the " +
                "Minecraft account, not to the link. Link again any time with `/link` in game.",
        });
    },
};
