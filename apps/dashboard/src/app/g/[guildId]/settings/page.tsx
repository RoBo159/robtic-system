import { apiGet } from "@/lib/api.server";
import { SettingsForm } from "@/components/settings-form";
import type { GuildDirectory, GuildSettings } from "@/lib/types";

export default async function SettingsPage({ params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const [settings, directory] = await Promise.all([
        apiGet<GuildSettings>(`/guilds/${guildId}/settings`),
        apiGet<GuildDirectory>(`/guilds/${guildId}/directory`),
    ]);

    return (
        <>
            <h1 className="page-title">Settings</h1>
            <p className="page-lede">The same configuration the slash commands write, in one place.</p>
            <SettingsForm guildId={guildId} settings={settings} directory={directory} />
        </>
    );
}
