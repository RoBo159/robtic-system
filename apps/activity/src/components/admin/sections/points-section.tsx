import type { AdminPointsConfig } from "../../../types/admin";
import { useSectionEditor } from "../../../hooks/use-section-editor";
import { SectionShell } from "../section-shell";
import { NumberField } from "../number-field";
import { ToggleField } from "../toggle-field";
import { Icon } from "../../icon";

/**
 * Points are the activity currency — earned passively from chat, combo, voice and streaks.
 * RC is the premium currency and has exactly one source: converting Points at the rate set here.
 */
export function PointsSection({ initial }: { initial: AdminPointsConfig }) {
    const { draft, setDraft, dirty, status, commit } = useSectionEditor("points", initial);

    function setReward(index: number, key: "streak" | "points", value: number) {
        const rewards = draft.streakRewards.map((row, i) => i === index ? { ...row, [key]: value } : row);
        setDraft({ ...draft, streakRewards: rewards });
    }

    function addReward() {
        setDraft({ ...draft, streakRewards: [...draft.streakRewards, { streak: 5, points: 10 }] });
    }

    function removeReward(index: number) {
        setDraft({ ...draft, streakRewards: draft.streakRewards.filter((_, i) => i !== index) });
    }

    return (
        <SectionShell
            title="Points & RC"
            icon="coin"
            description="How members earn Points from chat, combo, voice and streaks — and the rate that converts Points into RC."
            status={status}
            dirty={dirty}
            onSave={commit}
        >
            <NumberField
                label="Messages per point"
                hint="Real messages a member must send to earn 1 point."
                value={draft.messagesPerPoint}
                min={1}
                max={100000}
                onChange={(v) => setDraft({ ...draft, messagesPerPoint: v })}
            />
            <NumberField
                label="Combo score per point"
                hint="Combo score a member must earn to gain 1 point."
                value={draft.comboPerPoint}
                min={1}
                max={100000}
                onChange={(v) => setDraft({ ...draft, comboPerPoint: v })}
            />
            <NumberField
                label="Voice minutes per point"
                hint="Minutes of active (non-AFK) voice per point."
                value={draft.voiceMinutesPerPoint}
                min={1}
                max={100000}
                onChange={(v) => setDraft({ ...draft, voiceMinutesPerPoint: v })}
            />

            <div className="field">
                <span className="field__label">
                    Streak payouts
                    <span className="field__hint">reaching each day-count pays the listed points (e.g. 5 days → 10 points)</span>
                </span>

                {draft.streakRewards.length === 0 && (
                    <p className="muted" style={{ margin: 0 }}>No streak payouts configured.</p>
                )}

                {draft.streakRewards.map((row, index) => (
                    <div key={index} className="reward-row">
                        <label className="reward-row__field">
                            <span>Streak days</span>
                            <input
                                className="field__input"
                                type="number"
                                min={1}
                                value={row.streak}
                                onChange={(event) => setReward(index, "streak", Number(event.target.value))}
                            />
                        </label>
                        <span className="reward-row__arrow">→</span>
                        <label className="reward-row__field">
                            <span>Points</span>
                            <input
                                className="field__input"
                                type="number"
                                min={1}
                                value={row.points}
                                onChange={(event) => setReward(index, "points", Number(event.target.value))}
                            />
                        </label>
                        <button
                            type="button"
                            className="reward-row__remove"
                            aria-label="Remove payout"
                            onClick={() => removeReward(index)}
                        >
                            <Icon name="x" size={14} />
                        </button>
                    </div>
                ))}

                <button type="button" className="ghost-button" style={{ alignSelf: "flex-start" }} onClick={addReward}>
                    <Icon name="plus" size={13} style={{ verticalAlign: "-2px" }} /> Add payout
                </button>
            </div>

            <ToggleField
                label="RC conversion"
                hint="Lets members trade Points for RC with /points convert. Turning this off leaves existing RC untouched."
                checked={draft.conversionEnabled}
                onChange={(v) => setDraft({ ...draft, conversionEnabled: v })}
            />
            <NumberField
                label="Points per RC"
                hint="Points spent for 1 RC."
                value={draft.pointsPerRc}
                min={1}
                max={1000000}
                onChange={(v) => setDraft({ ...draft, pointsPerRc: v })}
            />
            <NumberField
                label="Minimum conversion"
                hint="Smallest number of points a single conversion may spend."
                value={draft.minConversionPoints}
                min={1}
                max={1000000}
                onChange={(v) => setDraft({ ...draft, minConversionPoints: v })}
            />
        </SectionShell>
    );
}
