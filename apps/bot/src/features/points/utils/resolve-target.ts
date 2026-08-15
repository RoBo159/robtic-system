import type { User } from "discord.js";
import type { CommandInteractionLike } from "@typings/feature";
import { UserRepository } from "@database/repositories";

export interface PointTarget {
    user: User;
    displayName: string;
    isSelf: boolean;
}

/** The `user` option, or the caller when absent. Shared by balance, add and remove. */
export async function resolveTarget(interaction: CommandInteractionLike, required = false): Promise<PointTarget> {
    const user = (required ? interaction.options.getUser("user", true) : interaction.options.getUser("user")) ?? interaction.user;
    const displayName = (await UserRepository.getDisplayName(user.id)) ?? user.username;

    return { user, displayName, isSelf: user.id === interaction.user.id };
}
