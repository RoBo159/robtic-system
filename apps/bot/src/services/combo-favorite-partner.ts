import type { IComboUserStats, IComboPartnerTally } from "@database/models";
import { favoritePartnerWeight } from "@core/combo/favorite-partner-weight";

/** Stats' partners are already kept sorted by favorite-weight on write, so this is just a safe read of the top entry. */
export function getFavoritePartner(stats: IComboUserStats | null): IComboPartnerTally | null {
    if (!stats?.partners?.length) return null;
    return [...stats.partners].sort((a, b) => favoritePartnerWeight(b) - favoritePartnerWeight(a))[0] ?? null;
}
