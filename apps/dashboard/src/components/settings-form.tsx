"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutate } from "@/lib/api";
import { useApiBase } from "@/lib/api-config";
import type { GuildDirectory, GuildSettings } from "@/lib/types";

/** Discord's GUILD_TEXT. Only text channels can be a commands channel. */
const TEXT_CHANNEL = 0;

type Status = { kind: "idle" | "saving" | "ok" | "error"; message: string };

export function SettingsForm({
    guildId,
    settings,
    directory,
}: {
    guildId: string;
    settings: GuildSettings;
    directory: GuildDirectory;
}) {
    const router = useRouter();
    const api = useApiBase();
    const [prefix, setPrefix] = useState(settings.prefix ?? "");
    const [commandsChannel, setCommandsChannel] = useState(settings.commandsChannelId ?? "");
    const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });

    const base = `/guilds/${guildId}/settings`;

    /**
     * Every save goes through here so the busy state, the error and the refresh are handled once.
     *
     * `router.refresh()` on success rather than patching local state: the server components above
     * hold the same data, and letting them re-read is what stops the page disagreeing with the
     * database after a write the API adjusted or rejected in part.
     */
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
                <h3>Prefix</h3>
                <p className="hint">What members type before a command. No spaces; 1–5 characters.</p>
                <div className="row">
                    <input
                        value={prefix}
                        onChange={event => setPrefix(event.target.value)}
                        placeholder="!"
                        maxLength={5}
                        aria-label="Command prefix"
                    />
                    <button
                        disabled={busy || !prefix.trim()}
                        onClick={() => save("prefix", () => apiMutate(api, `${base}/prefix`, "PATCH", { prefix: prefix.trim() }))}
                    >
                        Save
                    </button>
                </div>
            </section>

            <section className="card">
                <h3>Commands channel</h3>
                <p className="hint">
                    Player-facing commands are confined here. Staff and operational commands are never restricted.
                </p>
                <div className="row">
                    <select
                        value={commandsChannel}
                        onChange={event => setCommandsChannel(event.target.value)}
                        aria-label="Commands channel"
                    >
                        <option value="">Select a channel…</option>
                        {directory.channels
                            .filter(channel => channel.type === TEXT_CHANNEL)
                            .map(channel => (
                                <option key={channel.id} value={channel.id}>#{channel.name}</option>
                            ))}
                    </select>
                    <button
                        disabled={busy || !commandsChannel}
                        onClick={() => save("commands channel", () =>
                            apiMutate(api, `${base}/commands-channel`, "PATCH", { channelId: commandsChannel }))}
                    >
                        Save
                    </button>
                </div>
            </section>

            <section className="card">
                <h3>Features</h3>
                <p className="hint">
                    Switching a feature off hides its commands and stops its listeners. “Default” means nobody in this
                    server has made a choice yet.
                </p>
                <div className="scroll-x">
                    <table>
                        <thead>
                            <tr><th>Feature</th><th>State</th><th>Commands</th><th /></tr>
                        </thead>
                        <tbody>
                            {settings.features.map(feature => (
                                <tr key={feature.key}>
                                    <td>
                                        <strong>{feature.key}</strong>
                                        <br />
                                        <span className="hint">{feature.description}</span>
                                    </td>
                                    <td>
                                        <span className={`badge ${feature.enabled ? "on" : "off"}`}>
                                            {feature.enabled ? "on" : "off"}
                                        </span>
                                        {!feature.overridden && <> <span className="badge">default</span></>}
                                    </td>
                                    <td>{feature.commands.join(", ") || "—"}</td>
                                    <td>
                                        <button
                                            className="secondary"
                                            disabled={busy}
                                            onClick={() => save(feature.key, () =>
                                                apiMutate(api, `${base}/features/${feature.key}`, "PATCH", {
                                                    enabled: !feature.enabled,
                                                }))}
                                        >
                                            {feature.enabled ? "Turn off" : "Turn on"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="card">
                <h3>Bot admin roles</h3>
                <p className="hint">
                    These roles may use commands marked admin-only, alongside Discord administrators.
                </p>
                <RolePicker
                    label="bot admin roles"
                    roles={directory.roles}
                    selected={settings.botAdminRoleIds}
                    busy={busy}
                    onSave={roleIds => save("bot admin roles", () =>
                        apiMutate(api, `${base}/bot-admin-roles`, "PUT", { roleIds }))}
                />
            </section>

            <section className="card">
                <h3>Staff tiers</h3>
                <p className="hint">
                    A member&apos;s highest matching tier is their score, and every gated command compares against it.
                </p>
                {settings.staffTiers.length === 0 ? (
                    <p className="empty">No tiers yet — create them with <code>/set-role</code> in Discord.</p>
                ) : (
                    settings.staffTiers.map(tier => (
                        <div key={tier.key} className="card" style={{ background: "var(--panel-raised)" }}>
                            <h3>{tier.key} <span className="badge">score {tier.score}</span></h3>
                            <RolePicker
                                label={`${tier.key} roles`}
                                roles={directory.roles}
                                selected={tier.roleIds}
                                busy={busy}
                                onSave={roleIds => save(`${tier.key} roles`, () =>
                                    apiMutate(api, `${base}/staff-tiers/${tier.key}/roles`, "PUT", { roleIds }))}
                            />
                        </div>
                    ))
                )}
            </section>
        </>
    );
}

/**
 * A multi-select over guild roles.
 *
 * Kept local because it holds a draft: the selection is only sent when Save is pressed, so removing
 * four roles is one write and one audit entry rather than four.
 */
function RolePicker({
    label,
    roles,
    selected,
    busy,
    onSave,
}: {
    label: string;
    roles: GuildDirectory["roles"];
    selected: string[];
    busy: boolean;
    onSave: (roleIds: string[]) => void;
}) {
    const [draft, setDraft] = useState<string[]>(selected);
    const dirty = draft.length !== selected.length || draft.some(id => !selected.includes(id));

    return (
        <div className="row">
            <select
                multiple
                size={Math.min(6, Math.max(3, roles.length))}
                value={draft}
                aria-label={label}
                onChange={event => setDraft(Array.from(event.target.selectedOptions, option => option.value))}
            >
                {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                ))}
            </select>
            <button disabled={busy || !dirty} onClick={() => onSave(draft)}>Save</button>
        </div>
    );
}
