import {
    MinecraftLinkRepository,
    MinecraftPlayerAccountRepository,
    MinecraftPlayerSessionRepository,
    MinecraftRecoveryCodeRepository,
    MinecraftRoleStateRepository,
    RobsRepository,
} from "@database/repositories";
import { Logger } from "@logger";
import { hashPassword, validatePassword, verifyPassword, type PasswordProblem } from "./password";
import { redeemLinkCode } from "./redeem-link-code";
import { publishBridgeEvent } from "./publish-bridge-event";

const CTX = "Minecraft";

/**
 * The three things a player can do to their account from Discord.
 *
 * <h2>Why these live here and not behind the API</h2>
 *
 * The bot reaches the database directly, exactly as {@link redeemLinkCode} and `unlinkAccount`
 * already do — it is not an API client and giving it one for three operations would mean issuing the
 * bot a key that can set passwords. These sit beside the functions they extend, use the same
 * repositories, and hash through the same {@link hashPassword} the API's login path verifies with.
 *
 * <h2>Linking is the existing flow plus a password</h2>
 *
 * {@link linkAccountWithPassword} calls {@link redeemLinkCode} rather than reimplementing it, so the
 * code claim, the duplicate checks and the in-game `/link` command all keep working exactly as they
 * did. The password is set afterwards, and if that write fails the player is left linked with no
 * password — which is a supported state, not a broken one: they recover through the same button
 * everybody else uses.
 *
 * <h2>Every result is a value, not an exception</h2>
 *
 * These are driven by Discord modals, where every outcome has a sentence that has to be shown to the
 * user. Throwing would mean the caller unwrapping errors to render ordinary refusals.
 */

export type AuthAccountFailure =
    | "invalid_code"
    | "discord_already_linked"
    | "uuid_already_linked"
    | "not_linked"
    | "wrong_password"
    | "no_password"
    | "invalid_password";

export type AuthAccountResult<T> =
    | ({ ok: true } & T)
    | { ok: false; reason: AuthAccountFailure; problem?: PasswordProblem; username?: string };

/**
 * Redeems a link code and sets the account's first password. The *Link Account* modal.
 *
 * Notifies the game server on success, because the player is standing in the link world watching a
 * screen that will not change on its own.
 */
export async function linkAccountWithPassword(input: {
    guildId: string;
    discordId: string;
    code: string;
    password: string;
}): Promise<AuthAccountResult<{ minecraftUuid: string; minecraftUsername: string }>> {
    const problem = validatePassword(input.password);
    if (problem) return { ok: false, reason: "invalid_password", problem };

    // The existing flow, unchanged: it claims the code destructively and applies the duplicate
    // checks that stop one Discord account holding two links.
    const redeemed = await redeemLinkCode(input.guildId, input.discordId, input.code);

    if (!redeemed.ok) {
        return { ok: false, reason: redeemed.reason, username: redeemed.minecraftUsername };
    }

    // Denormalised onto the robs row at link time, matching what LinkService.verify does — the
    // Discord path and the API path must leave the database in the same state.
    await RobsRepository.attachDiscordId(redeemed.minecraftUuid, input.discordId);

    await MinecraftPlayerAccountRepository.ensure({
        guildId: input.guildId,
        minecraftUuid: redeemed.minecraftUuid,
        minecraftUsername: redeemed.minecraftUsername,
        discordId: input.discordId,
    });

    await MinecraftPlayerAccountRepository.setPassword(
        input.guildId,
        redeemed.minecraftUuid,
        await hashPassword(input.password),
    );

    Logger.info(`Linked and set a password for ${redeemed.minecraftUsername}`, CTX);

    await publishBridgeEvent({
        guildId: input.guildId,
        type: "account_linked",
        serverKey: redeemed.serverKey,
        payload: {
            minecraftUuid: redeemed.minecraftUuid,
            minecraftUsername: redeemed.minecraftUsername,
            discordId: input.discordId,
            hasPassword: true,
        },
    });

    return {
        ok: true,
        minecraftUuid: redeemed.minecraftUuid,
        minecraftUsername: redeemed.minecraftUsername,
    };
}

/**
 * Redeems a recovery code and replaces the password. The *Change Password* modal.
 *
 * <h2>This is also how a first password gets set</h2>
 *
 * An account linked before RobticAuth has no password, and so does one an administrator has reset.
 * Both reach here by the same route as somebody who forgot theirs, and this does not check whether
 * there was an old password to replace — requiring one would lock out exactly the players who cannot
 * log in.
 *
 * Every session is ended. A password change is what somebody does when they think their account is
 * compromised, and leaving the other session alive would make it the one thing the change did not
 * fix.
 */
export async function changePassword(input: {
    guildId: string;
    discordId: string;
    recoveryCode: string;
    newPassword: string;
}): Promise<AuthAccountResult<{ minecraftUuid: string; minecraftUsername: string }>> {
    const problem = validatePassword(input.newPassword);
    if (problem) return { ok: false, reason: "invalid_password", problem };

    // Claimed destructively and matched on the Discord account, so a code read off somebody's
    // screen cannot be spent from another account — nor even consumed by the attempt.
    const claimed = await MinecraftRecoveryCodeRepository.claim(
        input.guildId,
        input.recoveryCode,
        input.discordId,
    );

    if (!claimed) return { ok: false, reason: "invalid_code" };

    await MinecraftPlayerAccountRepository.ensure({
        guildId: input.guildId,
        minecraftUuid: claimed.minecraftUuid,
        minecraftUsername: claimed.minecraftUsername,
        discordId: input.discordId,
    });

    await MinecraftPlayerAccountRepository.setPassword(
        input.guildId,
        claimed.minecraftUuid,
        await hashPassword(input.newPassword),
    );

    const sessionsEnded = await MinecraftPlayerSessionRepository.revokeAll(
        input.guildId,
        claimed.minecraftUuid,
    );

    Logger.info(
        `Password changed for ${claimed.minecraftUsername}; ${sessionsEnded} session(s) ended`,
        CTX,
    );

    await publishBridgeEvent({
        guildId: input.guildId,
        type: "password_changed",
        serverKey: claimed.serverKey ?? null,
        payload: {
            minecraftUuid: claimed.minecraftUuid,
            minecraftUsername: claimed.minecraftUsername,
            discordId: input.discordId,
            // Redeeming a recovery code proves ownership twice over — the player asked for it in
            // game and redeemed it from the linked Discord account — so somebody sitting at the
            // login prompt is let in rather than asked to type what they have just chosen.
            authenticate: true,
        },
    });

    return {
        ok: true,
        minecraftUuid: claimed.minecraftUuid,
        minecraftUsername: claimed.minecraftUsername,
    };
}

/**
 * Verifies the password and removes the link. The *Unlink Account* modal.
 *
 * The password is required, and that is the whole point: unlinking is how somebody hands their
 * Minecraft account to a different Discord account, so doing it from a Discord session alone would
 * let anybody who borrowed an unlocked phone give the account away.
 *
 * The robs balance is deliberately untouched, matching `unlinkAccount` and `AuthService.forceUnlink`:
 * robs belong to the Minecraft account, and unlinking Discord must not cost the player anything.
 */
export async function unlinkWithPassword(input: {
    guildId: string;
    discordId: string;
    password: string;
}): Promise<AuthAccountResult<{ minecraftUuid: string; minecraftUsername: string }>> {
    const link = await MinecraftLinkRepository.getByDiscordId(input.guildId, input.discordId);
    if (!link) return { ok: false, reason: "not_linked" };

    const account = await MinecraftPlayerAccountRepository.getWithHash(
        input.guildId,
        link.minecraftUuid,
    );

    // No password means there is nothing to check, and unlinking on that basis would make an
    // account that has never set one the easiest to take. Told plainly instead: set one first.
    if (!account?.passwordHash) {
        return { ok: false, reason: "no_password", username: link.minecraftUsername };
    }

    if (!(await verifyPassword(account.passwordHash, input.password))) {
        return { ok: false, reason: "wrong_password", username: link.minecraftUsername };
    }

    await MinecraftLinkRepository.delete(input.guildId, input.discordId);
    await MinecraftRoleStateRepository.remove(input.guildId, input.discordId);
    await RobsRepository.attachDiscordId(link.minecraftUuid, null);

    await MinecraftPlayerSessionRepository.revokeAll(input.guildId, link.minecraftUuid);
    await MinecraftRecoveryCodeRepository.discard(input.guildId, link.minecraftUuid);
    await MinecraftPlayerAccountRepository.delete(input.guildId, link.minecraftUuid);

    Logger.info(`Unlinked ${link.minecraftUsername} at their own request`, CTX);

    await publishBridgeEvent({
        guildId: input.guildId,
        type: "account_unlinked",
        payload: {
            minecraftUuid: link.minecraftUuid,
            minecraftUsername: link.minecraftUsername,
            discordId: input.discordId,
        },
    });

    return {
        ok: true,
        minecraftUuid: link.minecraftUuid,
        minecraftUsername: link.minecraftUsername,
    };
}
