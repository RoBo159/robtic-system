import {
    ApiError,
    normaliseUuid,
    type FriendAction,
    type FriendActionResponse,
    type FriendListResponse,
} from "@sdk";
import {
    MinecraftFriendRepository,
    MinecraftPlayerPrefsRepository,
    MinecraftPlayerStatsRepository,
} from "@database/repositories";
import { PremiumService } from "./premium-service";

/**
 * The friend system: mutual friendships, directional requests, and the teleport preference.
 *
 * <h2>Requests are directional, friendships are not</h2>
 *
 * `/friend add` writes a request from A to B. Accepting it deletes the request and writes one
 * symmetric friendship row. Nothing anywhere keeps a one-sided friendship, which is what stops the
 * two halves drifting apart.
 *
 * An `add` that answers an existing request from the other side is treated as an accept rather
 * than a second request — two people who both ran `/friend add` on each other plainly agree, and
 * making them run `accept` as well would be a pointless extra step.
 */
export class FriendService {
    /** Everything the friends GUI needs, in one read. */
    static async list(guildId: string, uuid: string, onlineUuids: string[]): Promise<FriendListResponse> {
        const normalised = normaliseUuid(uuid);
        const online = new Set(onlineUuids.map(normaliseUuid));

        const [friendUuids, incoming, outgoing, prefs] = await Promise.all([
            MinecraftFriendRepository.listFriends(normalised),
            MinecraftFriendRepository.incoming(normalised),
            MinecraftFriendRepository.outgoing(normalised),
            MinecraftPlayerPrefsRepository.get(normalised),
        ]);

        // One batched read for every friend's name and last-seen, rather than one per friend.
        const stats = await MinecraftPlayerStatsRepository.getMany(friendUuids);
        const byUuid = new Map(stats.map(row => [row.minecraftUuid, row]));

        // Premium is resolved per friend so the GUI can show the icon. Each is individually cached
        // by PremiumService, so a second open of the menu costs nothing.
        const friends = await Promise.all(
            friendUuids.map(async friendUuid => {
                const row = byUuid.get(friendUuid);
                const premium = await PremiumService.entitlementsOf(guildId, friendUuid);

                return {
                    uuid: friendUuid,
                    username: row?.username ?? "unknown",
                    online: online.has(friendUuid),
                    premiumTier: premium.tierName,
                    lastSeenAt: row?.lastSeenAt?.toISOString() ?? null,
                };
            }),
        );

        friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));

        return {
            uuid: normalised,
            friends,
            incoming: incoming.map(request => ({
                uuid: request.requesterUuid,
                username: request.requesterUsername,
                createdAt: request.createdAt.toISOString(),
            })),
            outgoing: outgoing.map(request => ({
                uuid: request.targetUuid,
                username: request.requesterUsername,
                createdAt: request.createdAt.toISOString(),
            })),
            autoAcceptTp: prefs?.friendTpAutoAccept ?? false,
        };
    }

    static async act(input: {
        uuid: string;
        username: string;
        action: FriendAction;
        targetUuid: string;
        targetUsername: string;
    }): Promise<FriendActionResponse> {
        const self = normaliseUuid(input.uuid);
        const target = normaliseUuid(input.targetUuid);

        if (self === target) {
            throw ApiError.validation({ targetUuid: "you cannot befriend yourself" });
        }

        const outcome = await this.apply(self, input.username, target, input.targetUsername, input.action);
        const friendCount = await MinecraftFriendRepository.countFriends(self);

        return { action: input.action, outcome, friendCount };
    }

    private static async apply(
        self: string,
        username: string,
        target: string,
        targetUsername: string,
        action: FriendAction,
    ): Promise<FriendActionResponse["outcome"]> {
        switch (action) {
            case "add": {
                if (await MinecraftFriendRepository.areFriends(self, target)) return "already-friends";

                // They asked first — treat this as the acceptance it plainly is.
                const reciprocal = await MinecraftFriendRepository.findRequest(target, self);
                if (reciprocal) {
                    await MinecraftFriendRepository.befriend(self, target);
                    await MinecraftFriendRepository.clearBetween(self, target);
                    return "accepted";
                }

                await MinecraftFriendRepository.request({
                    requesterUuid: self,
                    requesterUsername: username,
                    targetUuid: target,
                });
                return "requested";
            }

            case "accept": {
                const request = await MinecraftFriendRepository.findRequest(target, self);
                if (!request) return "no-request";

                await MinecraftFriendRepository.befriend(self, target);
                await MinecraftFriendRepository.clearBetween(self, target);
                return "accepted";
            }

            case "deny": {
                const removed = await MinecraftFriendRepository.removeRequest(target, self);
                return removed ? "denied" : "no-request";
            }

            case "cancel": {
                const removed = await MinecraftFriendRepository.removeRequest(self, target);
                return removed ? "cancelled" : "no-request";
            }

            case "remove": {
                const removed = await MinecraftFriendRepository.unfriend(self, target);
                // Requests are cleared too, so removing somebody does not leave a stale request
                // that would silently re-friend them on the next accept.
                await MinecraftFriendRepository.clearBetween(self, target);
                return removed ? "removed" : "no-request";
            }

            default:
                throw ApiError.validation({ action: `unknown friend action "${action}"` });
        }
    }

    // The friend-teleport preference is set through SurvivalService.setSettings, alongside every
    // other player preference. It used to have its own method and endpoint here, which meant two
    // routes writing the same document.

    /** Used by `/friend tp` to decide whether to ask the target first. */
    static async canTeleportTo(requesterUuid: string, targetUuid: string): Promise<{ friends: boolean; auto: boolean }> {
        const self = normaliseUuid(requesterUuid);
        const target = normaliseUuid(targetUuid);

        const [friends, prefs] = await Promise.all([
            MinecraftFriendRepository.areFriends(self, target),
            MinecraftPlayerPrefsRepository.get(target),
        ]);

        return { friends, auto: prefs?.friendTpAutoAccept ?? false };
    }
}
