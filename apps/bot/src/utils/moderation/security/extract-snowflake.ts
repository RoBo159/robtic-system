import { SNOWFLAKE_IN_TEXT_REGEX } from "@constants";

export function extractSnowflake(text: string): string | undefined {
    const match = text.match(SNOWFLAKE_IN_TEXT_REGEX);
    return match?.[0];
}
