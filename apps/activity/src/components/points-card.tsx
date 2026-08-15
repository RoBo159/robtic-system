import type { Profile } from "../types/profile";
import { formatNumber, formatRank } from "../utils/format";
import { Icon } from "./icon";

/**
 * The activity wallet. Points come from chat, combo, voice and streaks; RC has exactly one
 * source — converting Points — so the two are shown side by side rather than as one balance.
 */
export function PointsCard({ points }: { points: Profile["points"] }) {
    const spent = Math.max(0, points.lifetimePoints - points.points);

    return (
        <section className="card">
            <h2 className="card__title"><Icon name="star" size={14} /> Points</h2>
            <div className="stat-grid" style={{ marginTop: 0 }}>
                <div className="stat stat--coins">
                    <span className="stat__label">Balance</span>
                    <div className="stat__value">{formatNumber(points.points)}</div>
                    <div className="stat__meta">{formatRank(points.rank)} in server</div>
                </div>
                <div className="stat stat--coins">
                    <span className="stat__label">RC</span>
                    <div className="stat__value">{formatNumber(points.rc)}</div>
                    <div className="stat__meta">converted from points</div>
                </div>
            </div>

            <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
                {formatNumber(points.lifetimePoints)} earned all-time
                {spent > 0 && ` · ${formatNumber(spent)} spent`}
            </p>
        </section>
    );
}
