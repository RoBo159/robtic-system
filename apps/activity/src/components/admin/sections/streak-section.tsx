import type { AdminStreakConfig, GuildChannelInfo, GuildRoleInfo } from "../../../types/admin";
import { useSectionEditor } from "../../../hooks/use-section-editor";
import { channelOptions, roleOptions } from "../../../utils/to-options";
import { SectionShell } from "../section-shell";
import { EntityMultiSelect } from "../entity-multi-select";
import { EntitySelect } from "../entity-select";
import { ToggleField } from "../toggle-field";
import { NumberField } from "../number-field";

interface Props {
    initial: AdminStreakConfig;
    channels: GuildChannelInfo[];
    roles: GuildRoleInfo[];
}

export function StreakSection({ initial, channels, roles }: Props) {
    const { draft, setDraft, dirty, status, commit } = useSectionEditor("streak", initial);

    return (
        <SectionShell
            title="Streaks"
            icon="fire"
            description="Which channels keep a streak alive, how long it lasts, and who can give it back."
            status={status}
            dirty={dirty}
            onSave={commit}
        >
            <EntityMultiSelect
                label="Streak channels"
                hint="A qualifying message in any of these extends the streak."
                selected={draft.channels}
                options={channelOptions(channels)}
                onChange={(ids) => setDraft({ ...draft, channels: ids })}
            />
            <ToggleField
                label="Expiry reminders"
                hint="DM members before their streak lapses."
                checked={draft.remindersEnabled}
                onChange={(v) => setDraft({ ...draft, remindersEnabled: v })}
            />
            <EntitySelect
                label="Announcement channel"
                hint="Where milestones are posted. Leave as None to reply in the channel that earned the streak."
                value={draft.announceChannelId}
                options={channelOptions(channels)}
                onChange={(v) => setDraft({ ...draft, announceChannelId: v })}
            />
            <NumberField
                label="Minimum message length"
                hint="Messages shorter than this don't count."
                value={draft.minMessageLength}
                min={1}
                max={200}
                onChange={(v) => setDraft({ ...draft, minMessageLength: v })}
            />

            <NumberField
                label="Claim every (days)"
                hint="1 means a streak advances once per day."
                value={draft.claimDays}
                min={1}
                max={30}
                onChange={(v) => setDraft({ ...draft, claimDays: v })}
            />
            <NumberField
                label="Expires after (days)"
                hint="Days without a claim before the streak dies. Raised automatically if it isn't above the claim window."
                value={draft.expireDays}
                min={2}
                max={60}
                onChange={(v) => setDraft({ ...draft, expireDays: v })}
            />
            <NumberField
                label="Return window (hours)"
                hint="After a streak dies the member is frozen for this long — messages start nothing — while staff can still give it back."
                value={draft.returnWindowHours}
                min={1}
                max={168}
                onChange={(v) => setDraft({ ...draft, returnWindowHours: v })}
            />
            <EntityMultiSelect
                label="Can return streaks"
                hint="Roles allowed to run /streak-return, on top of administrators."
                selected={draft.returnRoleIds}
                options={roleOptions(roles)}
                onChange={(ids) => setDraft({ ...draft, returnRoleIds: ids })}
            />

            <ToggleField
                label="Timeout ends the streak"
                hint="Also covers /mute, /jail and warn auto-mutes — they all apply a Discord timeout."
                checked={draft.breakOnTimeout}
                onChange={(v) => setDraft({ ...draft, breakOnTimeout: v })}
            />
            <ToggleField
                label="Kick ends the streak"
                hint="Detected from the audit log. A member who leaves on their own keeps their streak."
                checked={draft.breakOnKick}
                onChange={(v) => setDraft({ ...draft, breakOnKick: v })}
            />
        </SectionShell>
    );
}
