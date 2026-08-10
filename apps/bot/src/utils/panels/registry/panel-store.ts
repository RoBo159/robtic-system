import type { PanelDefinition } from "@typings/panel";
import { Logger } from "@logger";

const panels = new Map<string, PanelDefinition>();

export function registerPanel(panel: PanelDefinition): void {
    if (!panel?.key || typeof panel.getContent !== "function") {
        Logger.warn(`Skipped invalid panel definition (missing key or getContent)`, "Panels");
        return;
    }

    if (panels.has(panel.key)) {
        Logger.warn(`Panel key "${panel.key}" is already registered — overwriting`, "Panels");
    }

    panels.set(panel.key, panel);
}

export function getRegisteredPanel(key: string): PanelDefinition | undefined {
    return panels.get(key);
}

export function getRegisteredPanels(): PanelDefinition[] {
    return [...panels.values()];
}
