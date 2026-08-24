import { normaliseUuid, type SurvivalProfileResponse } from "@sdk";
import {
    MinecraftFriendRepository,
    MinecraftHomeRepository,
    MinecraftJailRepository,
    MinecraftLinkRepository,
    MinecraftPlayerStatsRepository,
    MinecraftRoleStateRepository,
    RobsRepository,
} from "@database/repositories";
import { PremiumService } from "./premium-service";
import { SurvivalService } from "./survival-service";

/**
 * The aggregate behind `/profile` in game and `/minecraft profile` on Discord.
 *
 * <h2>One read, two consumers</h2>
 *
 * Both surfaces want the whole picture at once. Assembling it here rather than in each caller
 * means they cannot drift, and it is one round trip instead of seven — which matters for the
 * in-game GUI, where seven sequential calls would be a visible pause before the menu opened.
 *
 * <h2>Home coordinates are deliberately absent</h2>
 *
 * The profile reports how many homes exist and how many are allowed, never where they are. That
 * boundary is enforced here, in the only place that assembles the response, rather than trusted to
 * every renderer downstream — a Discord embed that leaked a base location would be a real harm and
 * the sort that gets copy-pasted into a second embed later.
 */
export class SurvivalProfileService {
    static async of(input: {
        guildId: string;
        uuid: string;
        serverKey: string;
        online: boolean;
    }): Promise<SurvivalProfileResponse> {
        const uuid = normaliseUuid(input.uuid);

        const [link, stats, premium, robs, jail, homesUsed, friendCount] = await Promise.all([
            MinecraftLinkRepository.getByUuid(input.guildId, uuid),
            MinecraftPlayerStatsRepository.get(uuid),
            PremiumService.entitlementsOf(input.guildId, uuid),
            RobsRepository.get(uuid),
            MinecraftJailRepository.findActive(input.guildId, uuid),
            MinecraftHomeRepository.count(uuid, input.serverKey),
            MinecraftFriendRepository.countFriends(uuid),
        ]);

        // Read from the projection the game servers keep current, so the profile can name a rank
        // without this service holding its own copy of the ladder.
        const roleState = link
            ? await MinecraftRoleStateRepository.getByDiscordId(input.guildId, link.discordId)
            : null;

        // releaseAt is null for a permanent sentence, which is reported as null remaining time
        // rather than zero — "forever" and "time served" must not render the same.
        const jailRemainingMs = jail?.releaseAt
            ? Math.max(0, jail.releaseAt.getTime() - Date.now())
            : null;

        return {
            uuid,
            username: stats?.username ?? link?.minecraftUsername ?? "unknown",
            online: input.online,
            discordId: link?.discordId ?? null,
            linked: Boolean(link),
            premium,
            playtimeMs: stats?.playtimeMs ?? 0,
            firstJoinAt: stats?.firstJoinAt?.toISOString() ?? null,
            lastSeenAt: stats?.lastSeenAt?.toISOString() ?? null,
            robs: robs?.robs ?? 0,
            kills: stats?.kills ?? 0,
            deaths: stats?.deaths ?? 0,
            jailed: Boolean(jail),
            jailRemainingMs,
            jailCount: stats?.jailCount ?? 0,
            homesUsed,
            homeLimit: premium.homeLimit,
            friendCount,
            // The groups the game server last reported; the highest is not resolved here because
            // the ladder lives in the server's roles.yml, not in this service.
            rankName: roleState?.groups?.[0] ?? null,
            // Read off the same row playtime came from, so the AFK panel in the profile GUI costs
            // nothing beyond what the profile already fetches.
            afk: SurvivalService.afkStatisticsOf(stats),
        };
    }
}
