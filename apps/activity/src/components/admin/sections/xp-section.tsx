import type { AdminXpConfig, GuildChannelInfo, GuildRoleInfo } from "../../../types/admin";
import { useSectionEditor } from "../../../hooks/use-section-editor";
import { channelOptions, roleOptions } from "../../../utils/to-options";
import { SectionShell } from "../section-shell";
import { EntityMultiSelect } from "../entity-multi-select";
import { EntitySelect } from "../entity-select";
import { ToggleField } from "../toggle-field";

interface Props {
    initial: AdminXpConfig;
    channels: GuildChannelInfo[];
    roles: GuildRoleInfo[];
}

export function XpSection({ initial, channels, roles }: Props) {
    const { draft, setDraft, dirty, status, commit } = useSectionEditor("xp", initial);
    const chOpts = channelOptions(channels);
    const roleOpts = roleOptions(roles);

    return (
        <SectionShell
            title="XP & Activity"
            icon="zap"
            description="Channels that earn XP, support and staff channels, and inactivity decay."
            status={status}
            dirty={dirty}
            onSave={commit}
        >
            <EntityMultiSelect
                label="XP channels"
                hint="Messages here earn XP."
                selected={draft.chatChannels}
                options={chOpts}
                onChange={(ids) => setDraft({ ...draft, chatChannels: ids })}
            />
            <EntityMultiSelect
                label="Support channels"
                selected={draft.supportChannels}
                options={chOpts}
                onChange={(ids) => setDraft({ ...draft, supportChannels: ids })}
            />
            <EntityMultiSelect
                label="Staff channels"
                selected={draft.staffChannels}
                options={chOpts}
                onChange={(ids) => setDraft({ ...draft, staffChannels: ids })}
            />
            <EntityMultiSelect
                label="Allowed roles"
                hint="If any are set, only members with one of these roles earn XP."
                selected={draft.allowedRoles}
                options={roleOpts}
                onChange={(ids) => setDraft({ ...draft, allowedRoles: ids })}
            />
            <ToggleField
                label="XP decay"
                hint="Slowly removes XP from inactive members."
                checked={draft.decayEnabled}
                onChange={(v) => setDraft({ ...draft, decayEnabled: v })}
            />
            <EntitySelect
                label="Level-up channel"
                hint="Where level-ups are announced. Leave as None to keep them silent."
                value={draft.levelUpChannelId}
                options={chOpts}
                onChange={(v) => setDraft({ ...draft, levelUpChannelId: v })}
            />
        </SectionShell>
    );
}
