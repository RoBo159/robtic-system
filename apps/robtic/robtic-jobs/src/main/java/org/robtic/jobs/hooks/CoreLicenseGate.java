package org.robtic.jobs.hooks;

import org.bukkit.entity.Player;
import org.robtic.core.license.LicenseService;
import org.robtic.core.license.api.LicenseStatus;
import org.robtic.jobs.license.JobLicenseGate;

/**
 * The licence gate, answered by RobticCore.
 *
 * <h2>Status first, then use</h2>
 *
 * {@link LicenseService#use} already refuses anything that is missing or lapsed, so calling it alone
 * would be enough to gate a claim — but it collapses every refusal into one {@code false}, and
 * "you do not have a Workspace Licence" and "your Workspace Licence ran out last Tuesday" are
 * different problems with different fixes. The status is read first purely so the player is told
 * which one they have; {@code use} is then what actually authorises, records the use for the
 * statistics bridge and gives listeners their veto.
 *
 * <h2>An unknown licence id is a refusal, not an allowance</h2>
 *
 * A job naming a licence that {@code licenses.yml} does not define reaches {@code use}, which cannot
 * resolve it and returns false — so the claim is refused rather than silently ungated. That is the
 * safe direction: a typo in the job's {@code license:} key stops claims and gets noticed, where
 * treating it as "no licence required" would quietly remove a gate the operator believes is up.
 */
public final class CoreLicenseGate implements JobLicenseGate {

    private final LicenseService licenses;

    public CoreLicenseGate(LicenseService licenses) {
        this.licenses = licenses;
    }

    @Override
    public Decision check(Player player, String licenseId, String action) {
        LicenseStatus status = licenses.statusOf(player, licenseId);

        if (status == LicenseStatus.MISSING) {
            return Decision.MISSING;
        }

        if (status == LicenseStatus.EXPIRED) {
            return Decision.EXPIRED;
        }

        return licenses.use(player, licenseId, action) ? Decision.ALLOWED : Decision.REFUSED;
    }

    /**
     * Reads the licence the player is carrying, without spending it.
     *
     * {@code holding} is the read-only half of Core's licence service: it finds the signed item and
     * reports what it says, and unlike {@code use} it neither consumes a single-use licence nor
     * fires a listener's veto. That distinction is the whole reason this method exists separately —
     * the business lifecycle sweep runs against every business on the server on a timer, and a sweep
     * that spent licences would be catastrophic.
     *
     * A permanent licence reports {@link LicenceSnapshot#PERMANENT} rather than its stored zero, so
     * that callers doing ordinary "has this lapsed?" arithmetic get the right answer without having
     * to special-case it.
     */
    @Override
    public LicenceSnapshot snapshot(Player player, String licenseId) {
        try {
            return licenses.holding(player, licenseId)
                    .map(holding -> LicenceSnapshot.held(
                            holding.permanent() ? LicenceSnapshot.PERMANENT : holding.expiresAt()))
                    .orElseGet(LicenceSnapshot::notHeld);
        } catch (RuntimeException failure) {
            // Unknown, not "not held". A licence system that threw must never be the reason somebody
            // loses a business — see LicenceSnapshot on why the two are distinct states.
            return LicenceSnapshot.unknown();
        }
    }
}
