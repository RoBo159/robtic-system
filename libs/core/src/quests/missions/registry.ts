import { Logger } from "@logger";
import type { QuestTier } from "@constants";
import type { MissionTemplate } from "./types";

const CTX = "quests";

const templates = new Map<string, MissionTemplate>();

/**
 * Adds a mission template.
 *
 * Called once per template at module load. A duplicate key is a programming error rather than a
 * runtime condition, so it is logged loudly and the first registration wins — matching how the
 * module loader treats a duplicate command name.
 */
export function registerMissionTemplate(template: MissionTemplate): void {
    if (templates.has(template.key)) {
        Logger.error(`Duplicate mission template "${template.key}" ignored`, CTX);
        return;
    }
    templates.set(template.key, template);
}

/** A template by key, or undefined once one has been removed from the build. */
export function getMissionTemplate(key: string): MissionTemplate | undefined {
    return templates.get(key);
}

/** Every template a tier may roll. */
export function templatesForTier(tier: QuestTier): MissionTemplate[] {
    return [...templates.values()].filter(template => template.tiers.includes(tier));
}

/** Every template eligible for the weekly community challenge. */
export function communityTemplates(): MissionTemplate[] {
    return [...templates.values()].filter(template => template.community === true);
}

export function allMissionTemplates(): MissionTemplate[] {
    return [...templates.values()];
}

/** Drops every template. The reload path re-registers them as modules re-import. */
export function clearMissionTemplates(): void {
    templates.clear();
}
