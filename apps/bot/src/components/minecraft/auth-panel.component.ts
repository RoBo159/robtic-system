import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    type ButtonInteraction,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { MINECRAFT_AUTH } from "@constants";

/**
 * The permanent `#link-account` panel: three buttons, one message, posted once and left alone.
 *
 * <h2>Why nothing here is ephemeral or temporary</h2>
 *
 * The panel is the only entry point to account management, so it has to be somewhere a locked-out
 * player can find it without help. A message posted in response to a command would scroll away, and
 * a player who cannot log in is exactly the player who cannot be told where it went. One pinned
 * message, always present, is the whole design.
 *
 * <h2>The modals collect; they do not act</h2>
 *
 * These handlers build and open modals. Every submission is handled by
 * `auth-modals.component.ts`, which is where the database is touched — so this file contains no
 * credential handling at all and can be read as pure presentation.
 */

export const AUTH_PANEL_IDS = {
    link: "robtic_auth_link",
    changePassword: "robtic_auth_change_password",
    unlink: "robtic_auth_unlink",
} as const;

export const AUTH_MODAL_IDS = {
    link: "robtic_auth_link_modal",
    changePassword: "robtic_auth_change_password_modal",
    unlink: "robtic_auth_unlink_modal",
} as const;

export const AUTH_FIELD_IDS = {
    linkCode: "link_code",
    password: "password",
    recoveryCode: "recovery_code",
    newPassword: "new_password",
} as const;

/**
 * Builds the panel body.
 *
 * Exported so the panel definition that posts it and any future refresh render the same thing — a
 * panel that drifts from its own buttons is worse than no panel.
 */
export function buildAuthPanelContainer(): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0x2ecc71)
        .addTextDisplayComponents(td => td.setContent("## 🔗 Minecraft Account"))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent(
                "**First time?**\n" +
                "Join the server, run `/link` in game, then press **Link Account** below and enter the code it gives you.\n\n" +
                "**Forgot your password?**\n" +
                "Press **Forgot Password** on the login screen in game to get a recovery code, then use **Change Password** here.\n\n" +
                "**Leaving?**\n" +
                "**Unlink Account** disconnects your Minecraft account from Discord. Your robs are not affected.",
            ),
        )
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent(
                `-# Passwords are stored hashed and can never be read back — not by staff, not by anyone. ` +
                `Minimum ${MINECRAFT_AUTH.password.minLength} characters.`,
            ),
        )
        .addActionRowComponents(row =>
            row.setComponents(
                new ButtonBuilder()
                    .setCustomId(AUTH_PANEL_IDS.link)
                    .setLabel("Link Account")
                    .setEmoji("🔗")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(AUTH_PANEL_IDS.changePassword)
                    .setLabel("Change Password")
                    .setEmoji("🔑")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(AUTH_PANEL_IDS.unlink)
                    .setLabel("Unlink Account")
                    .setEmoji("✂️")
                    .setStyle(ButtonStyle.Danger),
            ),
        );
}

/** A password field. One definition, so the three modals cannot disagree about the limits. */
function passwordField(customId: string, label: string, placeholder: string): TextInputBuilder {
    return new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setMinLength(MINECRAFT_AUTH.password.minLength)
        .setMaxLength(MINECRAFT_AUTH.password.maxLength)
        .setPlaceholder(placeholder)
        .setRequired(true);
}

/**
 * A code field.
 *
 * Deliberately lax on length: link codes are six characters and recovery codes are eight with a
 * dash, and both are normalised before they are looked up. Rejecting a dash in the modal would mean
 * refusing the exact string the game showed the player.
 */
function codeField(customId: string, label: string, placeholder: string): TextInputBuilder {
    return new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setMinLength(4)
        .setMaxLength(20)
        .setPlaceholder(placeholder)
        .setRequired(true);
}

export const authLinkButtonHandler: ComponentHandler<ButtonInteraction> = {
    customId: AUTH_PANEL_IDS.link,

    async run(interaction: ButtonInteraction, _client: BotClient) {
        const modal = new ModalBuilder()
            .setCustomId(AUTH_MODAL_IDS.link)
            .setTitle("Link your Minecraft account")
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    codeField(AUTH_FIELD_IDS.linkCode, "Link code", "The code /link gave you"),
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    passwordField(AUTH_FIELD_IDS.password, "Password", "You will type this in game to log in"),
                ),
            );

        await interaction.showModal(modal);
    },
};

export const authChangePasswordButtonHandler: ComponentHandler<ButtonInteraction> = {
    customId: AUTH_PANEL_IDS.changePassword,

    async run(interaction: ButtonInteraction, _client: BotClient) {
        const modal = new ModalBuilder()
            .setCustomId(AUTH_MODAL_IDS.changePassword)
            .setTitle("Change your password")
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    codeField(AUTH_FIELD_IDS.recoveryCode, "Recovery code", "From Forgot Password in game"),
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    passwordField(AUTH_FIELD_IDS.newPassword, "New password", "At least 8 characters"),
                ),
            );

        await interaction.showModal(modal);
    },
};

export const authUnlinkButtonHandler: ComponentHandler<ButtonInteraction> = {
    customId: AUTH_PANEL_IDS.unlink,

    async run(interaction: ButtonInteraction, _client: BotClient) {
        const modal = new ModalBuilder()
            .setCustomId(AUTH_MODAL_IDS.unlink)
            .setTitle("Unlink your Minecraft account")
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    // The password is what makes this safe. Unlinking is how an account is handed to
                    // a different Discord account, so a borrowed unlocked phone must not be enough.
                    passwordField(AUTH_FIELD_IDS.password, "Password", "Confirm it is you"),
                ),
            );

        await interaction.showModal(modal);
    },
};
