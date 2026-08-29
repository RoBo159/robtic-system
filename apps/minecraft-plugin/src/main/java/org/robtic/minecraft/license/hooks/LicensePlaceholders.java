package org.robtic.minecraft.license.hooks;

import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.robtic.minecraft.placeholder.RobticPlaceholders;
import org.robtic.minecraft.license.LicenseService;
import org.robtic.minecraft.license.api.License;
import org.robtic.minecraft.license.api.LicenseHolding;
import org.robtic.minecraft.license.api.LicenseStatus;
import org.robtic.minecraft.license.item.LicenseItemFactory;

import java.util.Optional;

/**
 * Placeholders for every registered licence, without any of them being named in code.
 *
 * <pre>
 *   %robtic_license_count%              3          licences held, valid or expired
 *   %robtic_license_owned%              2          held and in date
 *   %robtic_license_expired%            1          held and lapsed
 *   %robtic_license_total%              8          licences that exist on the server
 *
 *   %robtic_license_&lt;id&gt;%              yes / no   held and in date
 *   %robtic_license_status_&lt;id&gt;%       valid / expired / missing
 *   %robtic_license_remaining_&lt;id&gt;%    6d 4h      time left, "-" when permanent or not held
 *   %robtic_license_expires_&lt;id&gt;%      2026-09-02 14:30
 *   %robtic_license_name_&lt;id&gt;&#37;         Miner's Licence
 * </pre>
 *
 * <h2>Resolved from the registry, not from a table</h2>
 *
 * There is no list of supported placeholders here and there must not be. A licence registered by a
 * plugin that did not exist when this class was written resolves the moment it registers.
 *
 * <h2>Prefix order matters</h2>
 *
 * The qualified forms are checked before the bare one, because a licence genuinely called
 * {@code status_something} is possible and the longer prefix must win. Checking the other way round
 * would resolve {@code license_status_miner} as the licence {@code status_miner}, silently.
 *
 * <h2>Offline players</h2>
 *
 * Answered as not held. Ownership is the item, an offline player's inventory is not loaded, and
 * there is no honest answer — see {@code LicenseService#statusOf}. A tab list rendering for an
 * offline player therefore shows "no" rather than a guess.
 */
public final class LicensePlaceholders implements RobticPlaceholders.Extension {

    private static final String PREFIX = "license_";
    private static final String STATUS = "license_status_";
    private static final String REMAINING = "license_remaining_";
    private static final String EXPIRES = "license_expires_";
    private static final String NAME = "license_name_";

    private static final String UNKNOWN = "-";

    private final LicenseService licenses;

    public LicensePlaceholders(LicenseService licenses) {
        this.licenses = licenses;
    }

    @Override
    public String resolve(OfflinePlayer player, String key) {
        if (player == null || !key.startsWith(PREFIX)) {
            return null;
        }

        // Server-wide, and answered before the player is resolved: a licence count on a login screen
        // has no player attached and does not need one.
        if (key.equals("license_total")) {
            return String.valueOf(licenses.all().size());
        }

        Player online = player.getPlayer();

        // Longest prefix first. See the class comment for why the order is load-bearing.
        if (key.startsWith(STATUS)) {
            return known(key.substring(STATUS.length()))
                    .map(license -> status(online, license).name().toLowerCase(java.util.Locale.ROOT))
                    .orElse(null);
        }

        if (key.startsWith(REMAINING)) {
            return known(key.substring(REMAINING.length()))
                    .map(license -> remaining(online, license))
                    .orElse(null);
        }

        if (key.startsWith(EXPIRES)) {
            return known(key.substring(EXPIRES.length()))
                    .map(license -> expires(online, license))
                    .orElse(null);
        }

        if (key.startsWith(NAME)) {
            return known(key.substring(NAME.length())).map(License::display).orElse(null);
        }

        // The counts, which are about the player rather than about one licence.
        switch (key) {
            case "license_count" -> {
                return online == null ? "0" : String.valueOf(licenses.heldBy(online).size());
            }
            case "license_owned" -> {
                return online == null ? "0" : String.valueOf(licenses.validCount(online));
            }
            case "license_expired" -> {
                return online == null ? "0" : String.valueOf(licenses.expiredCount(online));
            }
            default -> {
                // Falls through to the bare per-licence form below.
            }
        }

        return known(key.substring(PREFIX.length()))
                .map(license -> status(online, license).usable() ? "yes" : "no")
                .orElse(null);
    }

    private LicenseStatus status(Player player, License license) {
        return player == null ? LicenseStatus.MISSING : licenses.statusOf(player, license.id());
    }

    private String remaining(Player player, License license) {
        if (player == null) {
            return UNKNOWN;
        }

        Optional<LicenseHolding> held = licenses.holding(player, license.id());

        if (held.isEmpty() || held.get().permanent()) {
            return UNKNOWN;
        }

        return LicenseItemFactory.describe(held.get().remaining(System.currentTimeMillis()));
    }

    private String expires(Player player, License license) {
        if (player == null) {
            return UNKNOWN;
        }

        return licenses.holding(player, license.id())
                .filter(holding -> !holding.permanent())
                .map(holding -> LicenseItemFactory.date(holding.expiresAt()))
                .orElse(UNKNOWN);
    }

    /**
     * The definition for an id, or empty when nothing is registered under it.
     *
     * Returning empty — and therefore null from {@code resolve} — rather than "no" is deliberate. A
     * placeholder for a licence that does not exist should look broken, because it is: a confident
     * "no" for a typo is how somebody spends an afternoon wondering why a gate never opens.
     */
    private Optional<License> known(String id) {
        return licenses.definition(id);
    }
}
