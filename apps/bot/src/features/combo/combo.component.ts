import type { FeatureComponentIndex } from "@typings/feature";
import { registerProfileTab } from "@core/profile";
import { comboMenuHandler } from "./components/menu";
import { comboLeaderboardPeriodHandler, comboLeaderboardTypeHandler } from "./components/leaderboard-controls";
import { comboSettingsPointsOpenHandler, comboSettingsPointsModalHandler } from "./components/settings-points";
import { comboSettingsRoleHandler } from "./components/settings-role";
import { buildStatusEmbed } from "./utils/combo-embeds";

/**
 * Registering the profile tab here rather than having profile import buildStatusEmbed keeps that
 * dependency pointing outwards: delete this folder and the tab disappears with it.
 */
registerProfileTab({
    key: "combo",
    feature: "combo",
    render: (guild, target, lang) => buildStatusEmbed(guild, target, lang as never),
});

export default {
    feature: "combo",
    handlers: [
        comboMenuHandler,
        comboLeaderboardPeriodHandler,
        comboLeaderboardTypeHandler,
        comboSettingsPointsOpenHandler,
        comboSettingsPointsModalHandler,
        comboSettingsRoleHandler,
    ],
} satisfies FeatureComponentIndex;
