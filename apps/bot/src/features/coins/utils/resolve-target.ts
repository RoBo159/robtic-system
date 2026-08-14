import type { User } from "discord.js";
import type { CommandInteractionLike } from "@typings/feature";
import { UserRepository } from "@database/repositories";

export interface CoinTarget {
    user: User;
    /** The member's chosen display name, falling back to their Discord username. */
    displayName: string;
    isSelf: boolean;
}

/** The `user` option, or the caller when it is absent. Shared by balance, add and remove. */
export async function resolveTarget(interaction: CommandInteractionLike, required = false): Promise<CoinTarget> {
    const user = (required ? interaction.options.getUser("user", true) : interaction.options.getUser("user")) ?? interaction.user;
    const displayName = (await UserRepository.getDisplayName(user.id)) ?? user.username;

    return { user, displayName, isSelf: user.id === interaction.user.id };
}
