import { useState } from "react";
import type { AdminFeaturesConfig } from "../../../types/admin";
import { saveAdminSection } from "../../../services/api/api-client";
import type { SaveStatus } from "../../../hooks/use-section-save";
import { SectionShell } from "../section-shell";
import { ToggleField } from "../toggle-field";

interface Props {
    initial: AdminFeaturesConfig;
}

/**
 * Per-guild feature switches — the panel equivalent of `/feature`.
 *
 * This section does not use useSectionEditor: what it reads (a catalog with each feature's
 * description and default) is not what it writes (a map of key → on/off), and the hook assumes
 * those are the same shape.
 */
export function FeaturesSection({ initial }: Props) {
    const [features, setFeatures] = useState(initial.features);
    const [baseline, setBaseline] = useState(initial.features);
    const [status, setStatus] = useState<SaveStatus>({ state: "idle" });

    const dirty = features.some((f, i) => f.enabled !== baseline[i]?.enabled);

    function toggle(key: string, enabled: boolean) {
        setFeatures(features.map(f => (f.key === key ? { ...f, enabled, overridden: true } : f)));
    }

    async function commit(): Promise<void> {
        setStatus({ state: "saving" });
        try {
            const states = Object.fromEntries(features.map(f => [f.key, f.enabled]));
            const snapshot = await saveAdminSection("features", { states } as never);
            setFeatures(snapshot.features.features);
            setBaseline(snapshot.features.features);
            setStatus({ state: "saved" });
            setTimeout(() => setStatus(s => (s.state === "saved" ? { state: "idle" } : s)), 2200);
        } catch (err) {
            setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
        }
    }

    return (
        <SectionShell
            title="Features"
            icon="gear"
            description="Turn parts of the bot on or off in this server. Off means its commands refuse and its listeners stay quiet."
            status={status}
            dirty={dirty}
            onSave={commit}
        >
            {features.length === 0 && (
                <p className="field__hint">
                    No features published yet — the bot writes this list when it starts.
                </p>
            )}

            {features.map(feature => (
                <ToggleField
                    key={feature.key}
                    label={feature.description}
                    hint={
                        `${feature.key} · ${feature.activation === "default-on" ? "on by default" : "off by default"}` +
                        (feature.overridden ? " · set for this server" : "") +
                        (feature.commands.length ? ` · /${feature.commands.join(", /")}` : "")
                    }
                    checked={feature.enabled}
                    onChange={v => toggle(feature.key, v)}
                />
            ))}
        </SectionShell>
    );
}
