"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutate } from "@/lib/api";
import { useApiBase } from "@/lib/api-config";
import type { GuildDirectory, QuestSettings } from "@/lib/types";

const TEXT_CHANNEL = 0;

type Status = { kind: "idle" | "saving" | "ok" | "error"; message: string };

export function QuestSettingsForm({
    guildId,
    settings,
    directory,
}: {
    guildId: string;
    settings: QuestSettings;
    directory: GuildDirectory;
}) {
    const router = useRouter();
    const api = useApiBase();
    const [questChannel, setQuestChannel] = useState(settings.questChannelId ?? "");
    const [communityChannel, setCommunityChannel] = useState(settings.communityChannelId ?? "");
    const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });

    const base = `/guilds/${guildId}/quests/settings`;
    const textChannels = directory.channels.filter(channel => channel.type === TEXT_CHANNEL);

    async function save(label: string, run: () => Promise<unknown>) {
        setStatus({ kind: "saving", message: `Saving ${label}…` });
        try {
            await run();
            setStatus({ kind: "ok", message: `${label} saved.` });
            router.refresh();
        } catch (error) {
            setStatus({ kind: "error", message: error instanceof Error ? error.message : `Could not save ${label}.` });
        }
    }

    const busy = status.kind === "saving";

    return (
        <>
            <p className={`status ${status.kind === "error" ? "error" : status.kind === "ok" ? "ok" : ""}`}>
                {status.message}
            </p>

            <section className="card">
                <h3>Channels</h3>
                <p className="hint">
                    One channel for every quest — easy, normal, hard, golden and VIP alike. The weekly community
                    challenge keeps its own, because it is posted once and edited all week.
                </p>

                <div className="row">
                    <label htmlFor="quest-channel" style={{ minWidth: 120 }}>Quests</label>
                    <select
                        id="quest-channel"
                        value={questChannel}
                        onChange={event => setQuestChannel(event.target.value)}
                    >
                        <option value="">Select a channel…</option>
                        {textChannels.map(channel => (
                            <option key={channel.id} value={channel.id}>#{channel.name}</option>
                        ))}
                    </select>
                    <button
                        disabled={busy || !questChannel}
                        onClick={() => save("quest channel", () =>
                            apiMutate(api, `${base}/quest-channel`, "PATCH", { channelId: questChannel }))}
                    >
                        Save
                    </button>
                </div>

                <div className="row">
                    <label htmlFor="community-channel" style={{ minWidth: 120 }}>Community</label>
                    <select
                        id="community-channel"
                        value={communityChannel}
                        onChange={event => setCommunityChannel(event.target.value)}
                    >
                        <option value="">Select a channel…</option>
                        {textChannels.map(channel => (
                            <option key={channel.id} value={channel.id}>#{channel.name}</option>
                        ))}
                    </select>
                    <button
                        disabled={busy || !communityChannel}
                        onClick={() => save("community channel", () =>
                            apiMutate(api, `${base}/community-channel`, "PATCH", { channelId: communityChannel }))}
                    >
                        Save
                    </button>
                </div>
            </section>

            <section className="card">
                <h3>Difficulties</h3>
                <p className="hint">A difficulty that is off stops generating. Existing quests of that tier run out.</p>
                <div className="row">
                    {Object.entries(settings.enabledTiers).map(([tier, enabled]) => (
                        <button
                            key={tier}
                            className="secondary"
                            disabled={busy}
                            onClick={() => save(tier, () =>
                                apiMutate(api, `${base}/tiers/${tier}`, "PATCH", { enabled: !enabled }))}
                        >
                            <span className={`badge ${enabled ? "on" : "off"}`}>{tier}</span>
                        </button>
                    ))}
                </div>
            </section>

            <section className="card">
                <h3>Windows</h3>
                <p className="hint">
                    Quests only appear inside these slices of the server&apos;s local day
                    (UTC{settings.utcOffsetMinutes >= 0 ? "+" : "−"}
                    {Math.abs(Math.trunc(settings.utcOffsetMinutes / 60))}:
                    {String(Math.abs(settings.utcOffsetMinutes % 60)).padStart(2, "0")}).
                    Editing them is still <code>/quest-config window</code> in Discord.
                </p>
                <div className="row">
                    {settings.windows.map(window => (
                        <span key={window.key} className={`badge ${window.enabled ? "on" : "off"}`}>
                            {window.key} {window.startHour}:00–{window.endHour}:00
                        </span>
                    ))}
                </div>
            </section>
        </>
    );
}
