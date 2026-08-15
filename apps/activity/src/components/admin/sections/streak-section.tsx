import type { AdminStreakConfig, GuildChannelInfo } from "../../../types/admin";
import { useSectionEditor } from "../../../hooks/use-section-editor";
import { channelOptions } from "../../../utils/to-options";
import { SectionShell } from "../section-shell";
import { EntityMultiSelect } from "../entity-multi-select";
import { EntitySelect } from "../entity-select";
import { ToggleField } from "../toggle-field";
import { NumberField } from "../number-field";

interface Props {
    initial: AdminStreakConfig;
    channels: GuildChannelInfo[];
}

export function StreakSection({ initial, channels }: Props) {
    const { draft, setDraft, dirty, status, commit } = useSectionEditor("streak", initial);

    return (
        <SectionShell
            title="Streaks"
            icon="fire"
            description="Which channels keep a daily streak alive, reminders, and the minimum message length."
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
        </SectionShell>
    );
}
