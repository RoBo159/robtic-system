import type { AdminRejoinRolesConfig, GuildRoleInfo } from "../../../types/admin";
import { useSectionEditor } from "../../../hooks/use-section-editor";
import { roleOptions } from "../../../utils/to-options";
import { SectionShell } from "../section-shell";
import { EntityMultiSelect } from "../entity-multi-select";
import { NumberField } from "../number-field";

interface Props {
    initial: AdminRejoinRolesConfig;
    roles: GuildRoleInfo[];
}

export function RejoinRolesSection({ initial, roles }: Props) {
    const { draft, setDraft, dirty, status, commit } = useSectionEditor("rejoinRoles", initial);

    // Mirrors the server-side rule so the panel explains the problem instead of silently
    // discarding the change on save.
    const windowsInvalid = draft.staffRetentionHours >= draft.retentionHours;

    return (
        <SectionShell
            title="Rejoin roles"
            icon="users"
            description="Give members their roles back when they return. Staff roles expire sooner than the rest."
            status={windowsInvalid ? { state: "error", message: "The staff window must be shorter than the member window." } : status}
            dirty={dirty && !windowsInvalid}
            onSave={commit}
        >
            <NumberField
                label="Member roles kept for (hours)"
                hint="How long a departing member's ordinary roles are held. The snapshot is deleted after this."
                value={draft.retentionHours}
                min={1}
                max={8760}
                onChange={(v) => setDraft({ ...draft, retentionHours: v })}
            />
            <NumberField
                label="Staff roles kept for (hours)"
                hint="Must be shorter — staff roles hand back powers, so they should expire first."
                value={draft.staffRetentionHours}
                min={1}
                max={8760}
                onChange={(v) => setDraft({ ...draft, staffRetentionHours: v })}
            />
            <EntityMultiSelect
                label="Never restored"
                hint="These are not saved when a member leaves and never come back."
                selected={draft.excludedRoleIds}
                options={roleOptions(roles)}
                onChange={(ids) => setDraft({ ...draft, excludedRoleIds: ids })}
            />
            <EntityMultiSelect
                label="Treated as staff"
                hint="Expire on the shorter window. Leave empty to use this server's staff tier roles."
                selected={draft.staffRoleIds}
                options={roleOptions(roles)}
                onChange={(ids) => setDraft({ ...draft, staffRoleIds: ids })}
            />
        </SectionShell>
    );
}
