import type { FeatureComponentIndex } from "@typings/feature";
import { registerProfileTab } from "@core/profile";
import { buildVoiceEmbed } from "./utils/build-voice-embed";

/**
 * Voice contributes a profile tab rather than profile importing from here, so the dependency
 * points outwards and deleting this folder takes the tab with it.
 *
 * No component handlers of its own yet — the index exists for the registration side effect, which
 * runs because the loader imports every *.component.ts.
 */
registerProfileTab({
    key: "voice",
    feature: "voice",
    render: async (guild, target) => {
        const user = await guild.client.users.fetch(target.id);
        return buildVoiceEmbed(guild, user);
    },
});

export default {
    feature: "voice",
    handlers: [],
} satisfies FeatureComponentIndex;
