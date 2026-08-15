import type { AdminVoiceConfig, GuildChannelInfo, GuildRoleInfo } from "../../../types/admin";
import { useSectionEditor } from "../../../hooks/use-section-editor";
import { voiceChannelOptions, roleOptions } from "../../../utils/to-options";
import { SectionShell } from "../section-shell";
import { EntityMultiSelect } from "../entity-multi-select";
import { ToggleField } from "../toggle-field";
import { NumberField } from "../number-field";

interface Props {
    initial: AdminVoiceConfig;
    channels: GuildChannelInfo[];
    roles: GuildRoleInfo[];
}

/**
 * Voice XP feeds the same level as chat XP — there is no separate voice level. These settings only
 * decide who earns, where, and at what rate.
 */
export function VoiceSection({ initial, channels, roles }: Props) {
    const { draft, setDraft, dirty, status, commit } = useSectionEditor("voice", initial);
    const chOpts = voiceChannelOptions(channels);

    return (
        <SectionShell
            title="Voice activity"
            icon="mic"
            description="Time in voice earns XP and points on a one-minute tick. The server's AFK channel never earns."
            status={status}
            dirty={dirty}
            onSave={commit}
        >
            <ToggleField
                label="Voice tracking"
                hint="Turning this off stops XP and points, but connected time is still recorded."
                checked={draft.enabled}
                onChange={(v) => setDraft({ ...draft, enabled: v })}
            />
            <EntityMultiSelect
                label="Tracked channels"
                hint="Leave empty to track every voice channel."
                selected={draft.trackedChannelIds}
                options={chOpts}
                onChange={(ids) => setDraft({ ...draft, trackedChannelIds: ids })}
            />
            <EntityMultiSelect
                label="Excluded channels"
                hint="Never earns, even when tracked above."
                selected={draft.excludedChannelIds}
                options={chOpts}
                onChange={(ids) => setDraft({ ...draft, excludedChannelIds: ids })}
            />
            <EntityMultiSelect
                label="Allowed roles"
                hint="If any are set, only members with one of these roles earn from voice."
                selected={draft.allowedRoleIds}
                options={roleOptions(roles)}
                onChange={(ids) => setDraft({ ...draft, allowedRoleIds: ids })}
            />
            <NumberField
                label="Alone multiplier"
                hint="Share of the normal rate when a member is below the minimum headcount. 0.25 = a quarter, 0 = nothing."
                value={draft.aloneMultiplier}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => setDraft({ ...draft, aloneMultiplier: v })}
            />
            <NumberField
                label="Members for full rate"
                hint="Humans in the channel needed before the full rate applies."
                value={draft.minMembersForFullRate}
                min={1}
                max={99}
                onChange={(v) => setDraft({ ...draft, minMembersForFullRate: v })}
            />
            <NumberField
                label="AFK timeout (minutes)"
                hint="With no message, command or reaction for this long, voice stops earning until the member does something."
                value={draft.afkTimeoutMinutes}
                min={1}
                max={240}
                onChange={(v) => setDraft({ ...draft, afkTimeoutMinutes: v })}
            />
        </SectionShell>
    );
}
