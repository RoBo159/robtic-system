import { MinecraftConfig } from "@database/models/MinecraftConfig";
import { MinecraftItemPriceRepository } from "@database/repositories";
import { invalidatePriceCache, publishBridgeEvent } from "@core/minecraft";
import { DiscordLogService } from "./discord-log-service";
import { Logger } from "@logger";

const CTX = "robtic-api";

export interface PushedSettings {
    statusChannelId: string;
    chatChannelId: string;
    staffChatChannelId: string;
    defaultLogChannelId: string;
    chatBridgeEnabled: boolean;
    roleSyncEnabled: boolean;
    staffSystemEnabled: boolean;
    jailRoleId: string;
    logTargets: Array<{ action: string; channelId: string }>;
    roleMappings: Array<{ roleId: string; group: string }>;
    prices: Array<{ itemKey: string; price: number; enabled: boolean }>;
}

/**
 * Stores the configuration a game server pushed, replacing whatever was there.
 *
 * <h2>Replace, not merge</h2>
 *
 * The plugin's config files are the whole truth, so a value absent from the push is absent because
 * the operator removed it. Merging would make deletion impossible — clearing `chat-channel` in
 * config.yml would leave the old channel in place forever, and the operator would have no way to
 * turn the bridge off from the file that is supposed to control it.
 *
 * The one thing deliberately preserved is anything the API owns rather than mirrors: `staffRanks`
 * is not touched here, because the plugin resolves ranks from its own roles.yml and no longer sends
 * them, and blanking the column would break an older plugin that still relies on the API's ladder.
 */
export class ServerSettingsService {
    static async apply(guildId: string, settings: PushedSettings): Promise<{ prices: number }> {
        const blankToUndefined = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

        await MinecraftConfig.findOneAndUpdate(
            { guildId },
            {
                $set: {
                    statusChannelId: blankToUndefined(settings.statusChannelId),
                    chatChannelId: blankToUndefined(settings.chatChannelId),
                    staffChatChannelId: blankToUndefined(settings.staffChatChannelId),
                    defaultLogChannelId: blankToUndefined(settings.defaultLogChannelId),
                    chatBridgeEnabled: settings.chatBridgeEnabled,
                    roleSyncEnabled: settings.roleSyncEnabled,
                    staffSystemEnabled: settings.staffSystemEnabled,
                    jailRoleId: blankToUndefined(settings.jailRoleId),
                    logTargets: settings.logTargets.map(target => ({
                        action: target.action,
                        channelId: target.channelId,
                        enabled: true,
                    })),
                    roleMappings: settings.roleMappings.map(mapping => ({
                        roleId: mapping.roleId,
                        group: mapping.group.toLowerCase(),
                    })),
                },
            },
            { upsert: true, returnDocument: "after" },
        );

        for (const price of settings.prices) {
            await MinecraftItemPriceRepository.set(guildId, price.itemKey, price.price, "plugin-config");
            await MinecraftItemPriceRepository.setEnabled(guildId, price.itemKey, price.enabled);
        }

        /**
         * An item dropped from prices.yml is taken out of the exchange.
         *
         * Disabled rather than deleted: the file is the source of truth for what is *sellable*, and
         * disabling achieves that, but the row also carries the last price it was sold at, which the
         * transaction history reads back. Deleting would make old sales unexplainable to satisfy a
         * tidiness nothing needs. Putting the item back in the file re-enables it at its new price.
         */
        const pushed = new Set(settings.prices.map(price => price.itemKey.toUpperCase()));
        const stored = await MinecraftItemPriceRepository.list(guildId);
        const removed = stored.filter(row => row.enabled && !pushed.has(row.itemKey.toUpperCase()));

        for (const row of removed) {
            await MinecraftItemPriceRepository.setEnabled(guildId, row.itemKey, false);
        }

        if (removed.length > 0) {
            Logger.info(
                `Disabled ${removed.length} item(s) absent from prices.yml: ${removed.map(r => r.itemKey).join(", ")}`,
                CTX,
            );
        }

        DiscordLogService.invalidate(guildId);
        invalidatePriceCache(guildId);

        await publishBridgeEvent({
            guildId,
            type: "config_invalidate",
            serverKey: null,
            payload: { reason: "settings_pushed" },
        });

        Logger.info(
            `Applied pushed configuration for ${guildId}: ${settings.prices.length} price(s), ` +
            `${settings.roleMappings.length} role mapping(s), ${settings.logTargets.length} log target(s)`,
            CTX,
        );

        return { prices: settings.prices.length };
    }
}
