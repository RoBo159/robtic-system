import type { PanelDefinition } from "@typings/panel";
import { ensurePanelsLoaded } from "./ensure-panels-loaded";
import { getRegisteredPanels } from "./panel-store";

export async function listPanels(): Promise<PanelDefinition[]> {
    await ensurePanelsLoaded();
    return getRegisteredPanels();
}
