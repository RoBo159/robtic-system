import { useEffect, useState } from "react";
import type { SaveStatus } from "../../../hooks/use-section-save";
import type { BotProfile } from "../../../types/bot-profile";
import { fetchBotProfile, saveBotProfile } from "../../../services/api/api-client";
import { SectionShell } from "../section-shell";
import { Avatar } from "../../avatar";

/** ~3MB source file keeps the base64 data URI under the API's 4MB cap. */
const AVATAR_FILE_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Per-server bot identity: nickname, bio and server avatar. Saved through Discord's
 * "Modify Current Member" endpoint, so it only changes this guild — not the bot globally.
 */
export function BotProfileSection() {
    const [profile, setProfile] = useState<BotProfile | null>(null);
    const [nick, setNick] = useState("");
    const [bio, setBio] = useState("");
    const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
    const [clearAvatar, setClearAvatar] = useState(false);
    const [status, setStatus] = useState<SaveStatus>({ state: "idle" });
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchBotProfile()
            .then((result) => {
                if (cancelled) return;
                setProfile(result);
                setNick(result.nick ?? "");
            })
            .catch((err: unknown) => {
                if (!cancelled) setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
            });
        return () => { cancelled = true; };
    }, []);

    function pickAvatar(file: File | null) {
        if (!file) return;
        if (file.size > AVATAR_FILE_MAX_BYTES) {
            setStatus({ state: "error", message: "Image too large — max 3MB" });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setAvatarDataUri(reader.result as string);
            setClearAvatar(false);
            setDirty(true);
        };
        reader.readAsDataURL(file);
    }

    async function save() {
        setStatus({ state: "saving" });
        try {
            await saveBotProfile({
                nick,
                bio,
                ...(clearAvatar ? { avatar: null } : avatarDataUri ? { avatar: avatarDataUri } : {}),
            });
            const refreshed = await fetchBotProfile().catch(() => null);
            if (refreshed) {
                setProfile(refreshed);
                setNick(refreshed.nick ?? "");
            }
            setAvatarDataUri(null);
            setClearAvatar(false);
            setDirty(false);
            setStatus({ state: "saved" });
        } catch (err) {
            setStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
        }
    }

    const previewUrl = clearAvatar ? null : (avatarDataUri ?? profile?.avatarUrl ?? null);
    const displayName = nick || profile?.username || "Bot";

    return (
        <SectionShell
            title="Bot Profile"
            icon="image"
            description="This server's bot nickname, avatar and bio."
            status={status}
            dirty={dirty}
            onSave={save}
        >
            {!profile ? <div className="spinner" aria-label="Loading bot profile" /> : (
                <>
                    <div className="bot-profile__row">
                        <Avatar src={previewUrl} name={displayName} seed="bot" size={56} />
                        <div className="bot-profile__avatar-actions">
                            <label className="ghost-button bot-profile__upload">
                                Upload image
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/gif"
                                    hidden
                                    onChange={(event) => pickAvatar(event.target.files?.[0] ?? null)}
                                />
                            </label>
                            {(profile.hasGuildAvatar || avatarDataUri) && !clearAvatar && (
                                <button
                                    type="button"
                                    className="ghost-button"
                                    onClick={() => { setClearAvatar(true); setAvatarDataUri(null); setDirty(true); }}
                                >
                                    Reset to global
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="field">
                        <span className="field__label">Name <span className="field__hint">nickname in this server; empty uses "{profile.username}"</span></span>
                        <input
                            className="field__input"
                            value={nick}
                            maxLength={32}
                            placeholder={profile.username}
                            onChange={(event) => { setNick(event.target.value); setDirty(true); }}
                        />
                    </div>

                    <div className="field">
                        <span className="field__label">Bio <span className="field__hint">the bot's "About Me" in this server</span></span>
                        <textarea
                            className="field__input projects__textarea"
                            value={bio}
                            maxLength={190}
                            rows={3}
                            placeholder="Shown on the bot's profile in this server"
                            onChange={(event) => { setBio(event.target.value); setDirty(true); }}
                        />
                    </div>
                </>
            )}
        </SectionShell>
    );
}
