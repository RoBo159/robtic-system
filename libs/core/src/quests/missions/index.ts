/**
 * Importing this barrel registers the built-in catalogue as a side effect, so any consumer that
 * reads the registry gets a populated one without having to know the definitions file exists.
 */
import "./definitions";

export {
    registerMissionTemplate,
    getMissionTemplate,
    templatesForTier,
    communityTemplates,
    allMissionTemplates,
    clearMissionTemplates,
} from "./registry";

export type { MissionTemplate, GeneratedMission } from "./types";
