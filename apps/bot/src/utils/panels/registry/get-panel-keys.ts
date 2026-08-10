import { listPanels } from "./list-panels";

export async function getPanelKeys(): Promise<{ name: string; value: string }[]> {
    const all = await listPanels();
    return all.map(p => ({ name: p.name ?? p.key, value: p.key }));
}
