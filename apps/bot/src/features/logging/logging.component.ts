import type { FeatureComponentIndex } from "@typings/feature";
import setupLogModalHandler from "./components/log-modal";
import { setupLogSelectHandler, setupLogOverrideHandler } from "./components/log-select";

export default {
    feature: "logging",
    handlers: [setupLogModalHandler, setupLogSelectHandler, setupLogOverrideHandler],
} satisfies FeatureComponentIndex;
