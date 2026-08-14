import type { LeaderboardResponse, Profile, ProfileDetails, SearchResult, TopCategory, TopPeriod } from "../../types/profile";
import type { AdminBootstrap, AdminConfigSection, AdminConfigSnapshot, BotAdminConfig } from "../../types/admin";
import type { UserSettings, UserSettingsUpdate } from "../../types/settings";
import type { OwnProject, ProjectSubmission } from "../../types/projects";
import type { BotProfile } from "../../types/bot-profile";

/** Discord rewrites /.proxy to the backend in production; the Vite dev server proxies it locally. */
const API_BASE = "/.proxy/api";

let accessToken: string | null = null;
let guildId: string | null = null;

export function configureApi(token: string, currentGuildId: string | null): void {
    accessToken = token;
    guildId = currentGuildId;
}

async function request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    if (!accessToken) throw new Error("API called before authentication completed");
    if (!guildId) throw new Error("This Activity must be launched inside a server");

    const query = new URLSearchParams({ guildId, ...params });
    const response = await fetch(`${API_BASE}${path}?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed with status ${response.status}`);
    }

    return response.json() as Promise<T>;
}

export function fetchOwnProfile(): Promise<Profile> {
    return request<Profile>("/profile");
}

export function fetchProfile(userId: string): Promise<Profile> {
    return request<Profile>(`/profile/${userId}`);
}

export async function searchUsers(query: string): Promise<SearchResult[]> {
    const { results } = await request<{ results: SearchResult[] }>("/search", { q: query });
    return results;
}

export function fetchLeaderboard(
    category: TopCategory,
    period: TopPeriod,
    page = 1,
    pageSize = 10,
): Promise<LeaderboardResponse> {
    return request<LeaderboardResponse>("/top", {
        category,
        period,
        page: String(page),
        pageSize: String(pageSize),
    });
}

async function postJson<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    if (!accessToken) throw new Error("API called before authentication completed");
    if (!guildId) throw new Error("This Activity must be launched inside a server");

    const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ guildId, ...payload }),
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed with status ${response.status}`);
    }

    return response.json() as Promise<T>;
}

export function fetchAdminConfig(): Promise<AdminBootstrap> {
    return request<AdminBootstrap>("/admin/config");
}

export async function saveProfileCustomization(update: {
    displayName?: string;
    profileColor?: string;
    textColor?: string;
    bannerUrl?: string;
    bio?: string;
    template?: string;
}): Promise<void> {
    await postJson<{ ok: true }>("/profile/customize", { ...update });
}

export function fetchBotProfile(): Promise<BotProfile> {
    return request<BotProfile>("/admin/bot-profile");
}

export async function saveBotProfile(update: { nick?: string; avatar?: string | null; bio?: string }): Promise<void> {
    await postJson<{ ok: true }>("/admin/bot-profile", { ...update });
}

export function fetchBotAdminConfig(): Promise<BotAdminConfig> {
    return request<BotAdminConfig>("/bot-admin/config");
}

export function saveBotAdminConfig(devGuildId: string | null): Promise<BotAdminConfig> {
    return postJson<BotAdminConfig>("/bot-admin/config", { devGuildId });
}

export function fetchProfileDetails(userId: string): Promise<ProfileDetails> {
    return request<ProfileDetails>(`/profile/${userId}/details`);
}

export function fetchSettings(): Promise<UserSettings> {
    return request<UserSettings>("/settings");
}

export function saveSettings(update: UserSettingsUpdate): Promise<UserSettings> {
    return postJson<UserSettings>("/settings", { ...update });
}

export async function fetchMyProjects(): Promise<OwnProject[]> {
    const { projects } = await request<{ projects: OwnProject[] }>("/projects/mine");
    return projects;
}

export async function submitProject(submission: ProjectSubmission): Promise<string> {
    const { projectId } = await postJson<{ ok: true; projectId: string }>("/projects", { ...submission });
    return projectId;
}

export type ModerationAction = "ban" | "unban" | "kick" | "timeout" | "untimeout";

export async function moderateUser(payload: {
    action: ModerationAction;
    userId: string;
    reason?: string;
    durationHours?: number;
    deleteMessages?: boolean;
}): Promise<void> {
    await postJson<{ ok: true }>("/admin/moderate", payload);
}

export async function saveAdminSection<S extends AdminConfigSection>(
    section: S,
    values: AdminConfigSnapshot[S],
): Promise<AdminConfigSnapshot> {
    const { config } = await postJson<{ config: AdminConfigSnapshot }>("/admin/config", { section, values });
    return config;
}
