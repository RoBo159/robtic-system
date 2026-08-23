import { ApiError, normaliseUuid, type HomeListResponse, type WorldLocationDto } from "@sdk";
import { MinecraftHomeRepository } from "@database/repositories";
import { DEFAULT_HOME_NAME } from "@database/models/MinecraftHome";
import { PremiumService } from "./premium-service";

/**
 * Player homes, with the limit enforced against the caller's premium tier.
 *
 * The limit is read at the moment of the write rather than stored on the row, so losing premium
 * takes the extra slots away from *new* homes without deleting the ones already made. Deleting
 * somebody's homes because their subscription lapsed would be a far worse failure than letting
 * them keep what they built.
 */
export class HomeService {
    /** The list plus the limit, which is what the plugin caches for the whole session. */
    static async list(guildId: string, uuid: string, serverKey: string): Promise<HomeListResponse> {
        const normalised = normaliseUuid(uuid);

        const [homes, premium] = await Promise.all([
            MinecraftHomeRepository.list(normalised, serverKey),
            PremiumService.entitlementsOf(guildId, normalised),
        ]);

        return {
            uuid: normalised,
            serverId: serverKey,
            homes: homes.map(home => ({
                name: home.name,
                location: home.location as WorldLocationDto,
                createdAt: home.createdAt.toISOString(),
            })),
            limit: premium.homeLimit,
            tierName: premium.tierName,
        };
    }

    /**
     * Creates or moves a home.
     *
     * Moving an existing home is always allowed, even over the limit: it consumes no new slot, and
     * refusing it would strand a player who dropped a tier with homes they could not relocate.
     */
    static async set(input: {
        guildId: string;
        uuid: string;
        serverKey: string;
        name: string;
        location: WorldLocationDto;
    }): Promise<HomeListResponse> {
        const uuid = normaliseUuid(input.uuid);
        const name = (input.name || DEFAULT_HOME_NAME).toLowerCase().trim();

        const [existing, premium] = await Promise.all([
            MinecraftHomeRepository.get(uuid, input.serverKey, name),
            PremiumService.entitlementsOf(input.guildId, uuid),
        ]);

        if (!existing) {
            const used = await MinecraftHomeRepository.count(uuid, input.serverKey);
            if (used >= premium.homeLimit) {
                throw ApiError.conflict(
                    `You have used all ${premium.homeLimit} of your homes. ` +
                    `Delete one with /delhome, or upgrade for more.`,
                );
            }
        }

        await MinecraftHomeRepository.put({
            uuid,
            serverKey: input.serverKey,
            name,
            location: input.location,
        });

        return this.list(input.guildId, uuid, input.serverKey);
    }

    static async remove(input: {
        guildId: string;
        uuid: string;
        serverKey: string;
        name: string;
    }): Promise<HomeListResponse> {
        const uuid = normaliseUuid(input.uuid);
        const removed = await MinecraftHomeRepository.remove(uuid, input.serverKey, input.name);

        if (!removed) throw ApiError.notFound(`A home called "${input.name}"`);

        return this.list(input.guildId, uuid, input.serverKey);
    }

    /**
     * Renames a home.
     *
     * A collision surfaces as a duplicate-key error from the unique index rather than a check
     * beforehand, so two renames racing cannot both pass and then both write. It is translated
     * here into something a player can act on.
     */
    static async rename(input: {
        guildId: string;
        uuid: string;
        serverKey: string;
        from: string;
        to: string;
    }): Promise<HomeListResponse> {
        const uuid = normaliseUuid(input.uuid);
        const to = input.to.toLowerCase().trim();

        if (!to) throw ApiError.validation({ to: "the new name cannot be empty" });

        try {
            const renamed = await MinecraftHomeRepository.rename(uuid, input.serverKey, input.from, to);
            if (!renamed) throw ApiError.notFound(`A home called "${input.from}"`);
        } catch (error) {
            if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
                throw ApiError.conflict(`You already have a home called "${to}".`);
            }
            throw error;
        }

        return this.list(input.guildId, uuid, input.serverKey);
    }
}
