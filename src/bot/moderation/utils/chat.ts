import {
    type GuildTextBasedChannel,
    type Guild,
    PermissionFlagsBits,
} from "discord.js";
import { Logger } from "@core/libs";

const checkChannelPermission = (channel: GuildTextBasedChannel, permission: keyof typeof PermissionFlagsBits, status: boolean) => {
    Logger.debug(channel.permissionsFor(channel.guild.id)?.has(PermissionFlagsBits[permission]));
    return channel.permissionsFor(channel.guild.id)?.has(PermissionFlagsBits[permission]) === status;
};

export const ChatUtils = {
    lock: async (channel: GuildTextBasedChannel, guild: Guild) => {
        if (!("permissionOverwrites" in channel)) return null;

        if(checkChannelPermission(channel, "SendMessages", false)) return `This channel is already locked. Members cannot send messages.`;

        await channel.permissionOverwrites.edit(guild.id, {
            SendMessages: false,
        });
        return `This channel has been locked. Members cannot send messages.`;
    },

    unlock: async (channel: GuildTextBasedChannel, guild: Guild) => {
        if (!("permissionOverwrites" in channel)) return null;

        if(checkChannelPermission(channel, "SendMessages", true)) return `This channel is already unlocked. Members can send messages.`;

        await channel.permissionOverwrites.edit(guild.id, {
            SendMessages: null,
        });
        return `This channel has been unlocked. Members can now send messages.`;
    },

    hide: async (channel: GuildTextBasedChannel, guild: Guild) => {
        if (!("permissionOverwrites" in channel)) return null;

        if(checkChannelPermission(channel, "ViewChannel", false)) return `This channel is already hidden. Members cannot view it.`;

        await channel.permissionOverwrites.edit(guild.id, {
            ViewChannel: false,
        });
        return `This channel has been hidden. Members cannot view it.`;
    },

    show: async (channel: GuildTextBasedChannel, guild: Guild) => {
        if (!("permissionOverwrites" in channel)) return null;

        if(checkChannelPermission(channel, "ViewChannel", true)) return `This channel is already shown. Members can view it.`;

        await channel.permissionOverwrites.edit(guild.id, {
            ViewChannel: null,
        });
        return `This channel has been shown. Members can now view it.`;
    },

    slowmode: async (channel: GuildTextBasedChannel, durationStr: string = "0") => {
        let seconds = 0;
        if (/^\d+$/.test(durationStr)) {
            seconds = parseInt(durationStr);
        } else {
            const match = durationStr.match(/^(\d+)(s|m|h)$/);
            if (match) {
                const val = parseInt(match[1]);
                const unit = match[2];
                if (unit === 's') seconds = val;
                if (unit === 'm') seconds = val * 60;
                if (unit === 'h') seconds = val * 3600;
            }
        }

        if (seconds > 21600) seconds = 21600;

        await channel.setRateLimitPerUser(seconds);

        if (seconds === 0) {
            return `Slowmode has been disabled.`;
        }

        return `Slowmode has been set to ${seconds} seconds.`;
    },

    clear: async (channel: GuildTextBasedChannel, amount: number = 100) => {
        if (!('bulkDelete' in channel)) return null;

        const limit = Math.min(amount, 100);

        try {
            const deleted = await channel.bulkDelete(limit, true);
            return `Deleted ${deleted.size} messages.`;
        } catch (error) {
            return `Failed to delete messages. Ensure they are not older than 14 days.`;
        }
    }
};
