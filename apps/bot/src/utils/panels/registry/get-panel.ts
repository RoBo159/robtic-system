import type { PanelDefinition } from "@typings/panel";
import { ensurePanelsLoaded } from "./ensure-panels-loaded";
import { getRegisteredPanel } from "./panel-store";

export async function getPanel(key: string): Promise<PanelDefinition | undefined> {
    await ensurePanelsLoaded();
    return getRegisteredPanel(key);
}
