import type { ContainerBuilder } from "discord.js";
import type { Lang } from "@shared/utils/lang";

export interface PanelDefinition {
    key: string;
    name: string;
    description: string;
    buttonLabel: string;
    accentColor: number;
    roles: {
        roleId: string;
        label: string;
    }[];
    getContent: (lang: Lang, roleLabel: string | null) => ContainerBuilder;
}

export const PANELS: PanelDefinition[] = [];

export function getPanel(key: string): PanelDefinition | undefined {
    return PANELS.find(p => p.key === key);
}

export function getPanelKeys(): { name: string; value: string }[] {
    return PANELS.map(p => ({ name: p.name, value: p.key }));
}

export function registerPanel(panel: PanelDefinition) {
    PANELS.push(panel);
}
