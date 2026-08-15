import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Profile, ProfileCustomization } from "../types/profile";
import { fetchOwnProfile, fetchProfile, fetchSettings, saveProfileCustomization, saveSettings } from "../services/api/api-client";
import { Avatar } from "../components/avatar";
import { XpCard } from "../components/xp-card";
import { StreakCard } from "../components/streak-card";
import { ComboCard } from "../components/combo-card";
import { VoiceCard } from "../components/voice-card";
import { PointsCard } from "../components/points-card";
import { ProfileDetailsPanel } from "../components/profile-details";
import { ProfileCustomizer } from "../components/profile-customizer";
import { ProfileBadges } from "../components/profile-badges";
import { Icon } from "../components/icon";
import { formatNumber, formatRank, formatSeconds } from "../utils/format";

interface ProfileViewProps {
    /** Null renders the signed-in user's own profile. */
    userId: string | null;
    onBack: (() => void) | null;
}

export function ProfileView({ userId, onBack }: ProfileViewProps) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [customizing, setCustomizing] = useState(false);
    /** Unsaved look edits, applied live so the user sees the result before accepting. */
    const [preview, setPreview] = useState<Partial<ProfileCustomization> | null>(null);
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [isPrivateProfile, setIsPrivateProfile] = useState<boolean | null>(null);
    const [privacyBusy, setPrivacyBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setProfile(null);
        setError(null);
        setCustomizing(false);
        setPreview(null);
        setEditingName(false);

        const load = userId ? fetchProfile(userId) : fetchOwnProfile();
        load
            .then((result) => {
                if (cancelled) return;
                setProfile(result);
                if (result.isSelf) {
                    fetchSettings()
                        .then((settings) => { if (!cancelled) setIsPrivateProfile(settings.privateProfile); })
                        .catch(() => null);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            });

        return () => { cancelled = true; };
    }, [userId, reloadKey]);

    if (error) return <p className="error">{error}</p>;
    if (!profile) return <div className="spinner" aria-label="Loading profile" />;

    const reload = () => setReloadKey((k) => k + 1);

    // While customizing, unsaved edits override the stored look so changes preview instantly.
    const look: ProfileCustomization = { ...profile.customization, ...(preview ?? {}) };
    const template = look.template ?? "classic";
    const banner = look.bannerUrl;
    // The banner template always has a banner strip — an accent gradient stands in for a missing image.
    const showBanner = template === "banner" || (Boolean(banner) && template !== "minimal");

    // The theme color re-tints the whole profile; the text color swaps the text palette.
    const accentStyle = {
        ...(look.color ? { "--profile-accent": look.color } : {}),
        ...(look.textColor ? { "--profile-text": look.textColor } : {}),
    } as CSSProperties;
    const profileClasses = [
        "profile",
        `profile--${template}`,
        look.color ? "profile--tinted" : "",
        look.textColor ? "profile--texted" : "",
    ].filter(Boolean).join(" ");

    async function commitName() {
        setEditingName(false);
        const next = nameDraft.trim();
        if (!profile || !next || next === profile.displayName) return;
        try {
            // Also renames the member in the server (bot permitting).
            await saveProfileCustomization({ displayName: next });
            reload();
        } catch { /* the profile simply keeps its old name */ }
    }

    function handleNameKey(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") void commitName();
        if (event.key === "Escape") setEditingName(false);
    }

    async function togglePrivacy() {
        if (isPrivateProfile === null || privacyBusy) return;
        setPrivacyBusy(true);
        try {
            const saved = await saveSettings({ privateProfile: !isPrivateProfile });
            setIsPrivateProfile(saved.privateProfile);
        } catch { /* keep the previous value */ } finally {
            setPrivacyBusy(false);
        }
    }

    const nameNode = profile.isSelf ? (
        editingName ? (
            <input
                className="profile-hero__name-input"
                value={nameDraft}
                maxLength={32}
                autoFocus
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => void commitName()}
                onKeyDown={handleNameKey}
            />
        ) : (
            <button
                type="button"
                className="profile-hero__name profile-hero__name--editable"
                title="Click to change your name (updates your server nickname too)"
                onClick={() => { setNameDraft(profile.displayName); setEditingName(true); }}
            >
                {profile.displayName} <Icon name="pencil" size={13} />
            </button>
        )
    ) : (
        <h1 className="profile-hero__name">{profile.displayName}</h1>
    );

    return (
        <div className={profileClasses} style={accentStyle}>
            <div className="profile__topline">
                {onBack && (
                    <button type="button" className="back-button" onClick={onBack}>
                        <Icon name="chevron-left" size={16} /> Back
                    </button>
                )}
                {profile.isSelf && (
                    <div className="profile__self-actions">
                        {isPrivateProfile !== null && (
                            <button
                                type="button"
                                className="ghost-button"
                                aria-pressed={isPrivateProfile}
                                disabled={privacyBusy}
                                title="Hide your stats from other members"
                                onClick={togglePrivacy}
                            >
                                <Icon name="lock" size={13} style={{ verticalAlign: "-2px" }} />
                                {" "}{isPrivateProfile ? "Private: on" : "Private: off"}
                            </button>
                        )}
                        <button
                            type="button"
                            className="ghost-button profile__customize"
                            aria-pressed={customizing}
                            onClick={() => {
                                setCustomizing((v) => !v);
                                if (customizing) setPreview(null);
                            }}
                        >
                            <Icon name="palette" size={14} style={{ verticalAlign: "-2px" }} /> Customize
                        </button>
                    </div>
                )}
            </div>

            {profile.isSelf && customizing && (
                <ProfileCustomizer
                    key={reloadKey}
                    profile={profile}
                    onPreview={setPreview}
                    onCancel={() => { setPreview(null); setCustomizing(false); }}
                    onSaved={() => { setPreview(null); setCustomizing(false); reload(); }}
                />
            )}

            <header className="profile-hero">
                {showBanner && (
                    <div
                        className={banner ? "profile-hero__banner" : "profile-hero__banner profile-hero__banner--fallback"}
                        style={banner ? { backgroundImage: `url(${banner})` } : undefined}
                    />
                )}
                <div className="profile-hero__body">
                    <Avatar
                        src={profile.avatarUrl}
                        name={profile.displayName}
                        seed={profile.discordId}
                        size={template === "compact" ? 44 : 72}
                        className="profile-hero__avatar"
                    />
                    <div className="profile-hero__text">
                        <div className="profile-hero__name-row">
                            {nameNode}
                            <ProfileBadges badges={profile.badges} />
                        </div>
                        <p className="profile-hero__sub">
                            @{profile.username} · Level {profile.xp.level} · {formatRank(profile.xp.rank)} in server
                            {" "}· <Icon name="coin" size={12} style={{ verticalAlign: "-1.5px" }} /> {formatNumber(profile.coins)}
                        </p>
                        {look.bio && <p className="profile-hero__bio">{look.bio}</p>}
                        {profile.isPrivate && <span className="badge">🔒 Private profile</span>}
                    </div>
                </div>
            </header>

            {template !== "minimal" && (
                <div className="stat-grid">
                    <div className="stat stat--xp">
                        <span className="stat__label"><Icon name="activity" size={14} /> Messages</span>
                        <div className="stat__value">{formatNumber(profile.xp.messageCount)}</div>
                    </div>
                    <div className="stat stat--streak">
                        <span className="stat__label"><Icon name="fire" size={14} /> Streak</span>
                        <div className="stat__value">{profile.streak.current}</div>
                        <div className="stat__meta">best {profile.streak.best}</div>
                    </div>
                    <div className="stat stat--combo">
                        <span className="stat__label"><Icon name="message" size={14} /> Best combo</span>
                        <div className="stat__value">{formatNumber(profile.combo.bestScore)}</div>
                    </div>
                    <div className="stat stat--xp">
                        <span className="stat__label"><Icon name="mic" size={14} /> Voice</span>
                        <div className="stat__value">{formatSeconds(profile.voice.totalActiveSeconds)}</div>
                        <div className="stat__meta">active time</div>
                    </div>
                    <div className="stat stat--coins">
                        <span className="stat__label"><Icon name="star" size={14} /> Points</span>
                        <div className="stat__value">{formatNumber(profile.points.points)}</div>
                        <div className="stat__meta">{formatNumber(profile.points.rc)} RC</div>
                    </div>
                    <div className="stat stat--coins">
                        <span className="stat__label"><Icon name="coin" size={14} /> Coins</span>
                        <div className="stat__value">{formatNumber(profile.coins)}</div>
                    </div>
                </div>
            )}

            <div className="profile__cards">
                <XpCard xp={profile.xp} />
                <StreakCard streak={profile.streak} />
                <ComboCard combo={profile.combo} partners={profile.partners} />
                <VoiceCard voice={profile.voice} />
                <PointsCard points={profile.points} />
            </div>

            {!profile.isPrivate && <ProfileDetailsPanel userId={profile.discordId} />}
        </div>
    );
}
