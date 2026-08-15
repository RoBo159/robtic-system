const PLACEHOLDER = "{args}";

/**
 * Merges a shortcut's fixed arguments with what the member typed.
 *
 * With `{args}` in the template the input is substituted there, which is what lets a trigger put
 * fixed text *after* the variable part — `warn add` takes the target first, so "spam in general"
 * as a reason needs the mention to land before it. Without the placeholder the template is simply
 * appended, which is the common "always use this reason" case.
 */
export function applyArgsTemplate(template: string, typed: string): string {
    const trimmed = template.trim();
    if (!trimmed) return typed;

    if (trimmed.includes(PLACEHOLDER)) {
        return trimmed.split(PLACEHOLDER).join(typed).replace(/\s+/g, " ").trim();
    }

    return [typed, trimmed].filter(Boolean).join(" ");
}
