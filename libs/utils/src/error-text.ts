import { SHARED_MESSAGES } from "@constants";

/**
 * A refusal as a single line of text, for `content:` rather than `embeds:`.
 *
 * Replaces errorEmbed across the interaction pipeline. An embed with a title, a code block, a
 * timestamp and a support footer is a lot of furniture around "Please wait 3s" — it draws the eye
 * harder than the command that succeeded, and in a busy channel a wall of red boxes for ordinary
 * mistyping reads as something being broken. The text carries the same information.
 */
export const errorText = (description: string): string => `${SHARED_MESSAGES.errorPrefix} ${description}`;
