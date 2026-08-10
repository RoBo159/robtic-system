import { SNOWFLAKE_REGEX, USER_MENTION_REGEX } from "@constants";

/**
 * Pulls a user id out of a mention or a raw id.
 *
 * `/unban` can't use a User option: Discord's user picker only offers people it can resolve in the
 * guild, and a banned user is by definition not one of them — so the id arrives as free text.
 */
export function resolveUserId(input: string): string | null {
    const token = input.trim();
    const mention = token.match(USER_MENTION_REGEX);
    const id = mention ? mention[1] : token;

    return SNOWFLAKE_REGEX.test(id) ? id : null;
}
