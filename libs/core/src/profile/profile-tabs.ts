import type { EmbedBuilder, Guild } from "discord.js";

export interface ProfileTabTarget {
    id: string;
    username: string;
    avatarUrl: string;
}

export interface ProfileTab {
    /** Select-menu value, e.g. "combo". */
    key: string;
    /** Owning feature's manifest key — the profile menu hides the tab when the feature is off. */
    feature: string;
    render: (guild: Guild, target: ProfileTabTarget, lang: string) => Promise<EmbedBuilder>;
}

/**
 * Tabs that features contribute to the `/profile` menu.
 *
 * The menu used to import each system's embed builder directly, which made profile depend on combo
 * and would have stopped `features/combo/` being deletable on its own. Inverting it also fixes a
 * real bug: a tab whose feature is switched off no longer renders as though it were on.
 *
 * Features register on import — the loader imports every `*.component.ts`, so registration happens
 * exactly once per boot and disappears with the folder.
 */
const tabs = new Map<string, ProfileTab>();

export function registerProfileTab(tab: ProfileTab): void {
    tabs.set(tab.key, tab);
}

export function getProfileTab(key: string): ProfileTab | undefined {
    return tabs.get(key);
}

/** Cleared before a reload so a removed feature stops contributing. */
export function clearProfileTabs(): void {
    tabs.clear();
}
