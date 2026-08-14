import type { AdminServerConfig, GuildChannelInfo, GuildRoleInfo } from "../../../types/admin";
import { useSectionEditor } from "../../../hooks/use-section-editor";
import { channelOptions, roleOptions } from "../../../utils/to-options";
import { SectionShell } from "../section-shell";
import { TextField } from "../text-field";
import { EntitySelect } from "../entity-select";
import { EntityMultiSelect } from "../entity-multi-select";

interface Props {
    initial: AdminServerConfig;
    channels: GuildChannelInfo[];
    roles: GuildRoleInfo[];
}

export function ServerSection({ initial, channels, roles }: Props) {
    const { draft, setDraft, dirty, status, commit } = useSectionEditor("server", initial);
    const chOpts = channelOptions(channels);
    const roleOpts = roleOptions(roles);

    const setRole = (slot: keyof AdminServerConfig["roles"], id: string | null) =>
        setDraft({ ...draft, roles: { ...draft.roles, [slot]: id } });

    return (
        <SectionShell
            title="Server & Main Bot"
            icon="sliders"
            description="Prefix, core channels, and role mappings shared across every bot."
            status={status}
            dirty={dirty}
            onSave={commit}
        >
            <TextField
                label="Command prefix"
                hint="Fallback prefix for main-bot text commands, e.g. !"
                value={draft.prefix ?? ""}
                maxLength={5}
                placeholder="!"
                onChange={(v) => setDraft({ ...draft, prefix: v.trim() || null })}
            />
            <EntitySelect
                label="Commands channel"
                hint="If set, main-bot text commands only run here."
                value={draft.commandsChannelId}
                options={chOpts}
                onChange={(v) => setDraft({ ...draft, commandsChannelId: v })}
            />
            <EntitySelect label="Members role" value={draft.roles.members} options={roleOpts} onChange={(v) => setRole("members", v)} />
            <EntitySelect label="Bots role" value={draft.roles.bots} options={roleOpts} onChange={(v) => setRole("bots", v)} />
            <EntitySelect label="English role" value={draft.roles.en} options={roleOpts} onChange={(v) => setRole("en", v)} />
            <EntitySelect label="Arabic role" value={draft.roles.ar} options={roleOpts} onChange={(v) => setRole("ar", v)} />
            <EntityMultiSelect
                label="Admin panel access roles"
                hint="Members with any of these roles can open this admin panel — no Administrator permission needed."
                selected={draft.adminPanelRoles}
                options={roleOpts}
                onChange={(ids) => setDraft({ ...draft, adminPanelRoles: ids })}
            />
        </SectionShell>
    );
}
