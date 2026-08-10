import type { Message } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { PREFIX_MESSAGES } from "@constants";

export function buildFakeInteraction(
    message: Message,
    client: BotClient,
    commandName: string,
    subcommandGroup: string | null,
    subcommand: string | null,
    values: Map<string, unknown>
): any {
    let sentMessage: Message | null = null;

    async function sendOrEdit(payload: any): Promise<Message | null> {
        const { flags: _flags, ...rest } = payload ?? {};
        if (sentMessage) {
            sentMessage = await sentMessage.edit(rest).catch(() => sentMessage);
            return sentMessage;
        }
        sentMessage = await message
            .reply({ ...rest, allowedMentions: rest.allowedMentions ?? { repliedUser: false } })
            .catch(() => null);
        return sentMessage;
    }

    const getValue = (name: string, required: boolean) => {
        const v = values.get(name);
        if ((v === undefined || v === null) && required) throw new Error(PREFIX_MESSAGES.missingOption(name));
        return v ?? null;
    };

    const fake: any = {
        commandName,
        user: message.author,
        member: message.member,
        guild: message.guild,
        guildId: message.guildId,
        channelId: message.channelId,
        channel: message.channel,
        client,
        deferred: false,
        replied: false,
        // Not a genuine Interaction — can't showModal(). Commands check this flag to fall back to a DM+button flow instead.
        isPrefix: true,

        options: {
            getSubcommand: (required = true) => {
                if (!subcommand && required) throw new Error(PREFIX_MESSAGES.noSubcommand);
                return subcommand;
            },
            getSubcommandGroup: (required = false) => {
                if (!subcommandGroup && required) throw new Error(PREFIX_MESSAGES.noSubcommandGroup);
                return subcommandGroup;
            },
            getString: (name: string, required = false) => getValue(name, required),
            getInteger: (name: string, required = false) => getValue(name, required),
            getBoolean: (name: string, required = false) => getValue(name, required),
            getUser: (name: string, required = false) => getValue(name, required),
            getChannel: (name: string, required = false) => getValue(name, required),
            getRole: (name: string, required = false) => getValue(name, required),
        },

        async deferReply() {
            fake.deferred = true;
        },
        async reply(opts: any) {
            fake.replied = true;
            return sendOrEdit(opts);
        },
        async editReply(opts: any) {
            fake.replied = true;
            return sendOrEdit(opts);
        },
        // Real interactions expose fetchReply() to grab the sent Message (e.g. to attach a component
        // collector). Prefix mode already holds that Message, so hand it back for parity.
        async fetchReply() {
            return sentMessage;
        },
        async deleteReply() {
            if (sentMessage) {
                await sentMessage.delete().catch(() => null);
                sentMessage = null;
            }
        },
        async followUp(opts: any) {
            const { flags: _flags, ...rest } = opts ?? {};
            if (!message.channel.isSendable()) return null;
            return message.channel.send(rest).catch(() => null);
        },
    };

    return fake;
}
