import { API_ROUTES, API_SCOPES, schema, v, validateBody } from "@sdk";
import { ok } from "../lib/respond";
import { queryParam, requireGuildId, requireServerId } from "../lib/request-context";
import { withIdempotency } from "../middleware/idempotency";
import { MailService } from "../services/mail-service";
import type { Route } from "../router";

/** Categories a caller may post. Kept in step with the model's own enum. */
const mailCategory = v.oneOf(["report_accepted", "report_refused", "jailed", "warned", "system"] as const);

export const mailRoutes: Route[] = [
    {
        method: "GET",
        path: API_ROUTES.mail.inbox,
        scope: API_SCOPES.server,
        summary: "A player's mailbox, newest first",
        tag: "Mail",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await MailService.mailbox(guildId, queryParam(context, "uuid")));
        },
    },
    {
        method: "GET",
        path: API_ROUTES.mail.pending,
        scope: API_SCOPES.server,
        summary: "Important mail not yet shown to this player on join",
        tag: "Mail",
        handler: async context => {
            const guildId = requireGuildId(context);
            return ok(await MailService.pending(guildId, queryParam(context, "uuid")));
        },
    },
    {
        method: "POST",
        path: API_ROUTES.mail.inbox,
        scope: API_SCOPES.staff,
        summary: "Post a mail to a player, delivered the next time they join",
        tag: "Mail",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                username: schema.username(),
                category: mailCategory,
                subject: v.string({ min: 1, max: 64 }),
                body: v.arrayOf(v.string({ max: 256 }), { max: 64 }),
                senderName: v.optional(v.string({ max: 32 })),
                important: v.optional(v.boolean()),
                referenceId: v.optional(v.string({ max: 64 })),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);
            const serverId = requireServerId(context, body.serverId);

            // Idempotent because a mail is the sort of thing a queued plugin request replays after
            // an outage, and "you have been jailed" arriving three times is its own small punishment.
            const { result, duplicate } = await withIdempotency(body.requestId, guildId, "mail.send", async () =>
                MailService.send({
                    guildId,
                    recipientUuid: body.uuid,
                    recipientUsername: body.username,
                    category: body.category,
                    subject: body.subject,
                    body: body.body,
                    senderName: body.senderName,
                    important: body.important,
                    referenceId: body.referenceId,
                    serverId,
                }),
            );

            return ok({ ...result, duplicate });
        },
    },
    {
        method: "POST",
        path: API_ROUTES.mail.read,
        scope: API_SCOPES.server,
        summary: "Mark a mail read, and acknowledge the mail shown to a player on join",
        tag: "Mail",
        handler: async context => {
            const body = validateBody(context.body, {
                guildId: schema.snowflake(),
                uuid: schema.uuid(),
                mailId: v.optional(v.string({ min: 12, max: 64 })),
                announcedIds: v.optional(v.arrayOf(v.string({ min: 12, max: 64 }), { max: 16 })),
                requestId: schema.requestId(),
                ...schema.serverIdentity(),
            });

            const guildId = requireGuildId(context, body.guildId);

            // Acknowledging first: the two are independent, and a mail the plugin has shown should
            // be recorded as shown even if the "mark read" half names an id that has since gone.
            if (body.announcedIds?.length) {
                await MailService.acknowledge(guildId, body.announcedIds);
            }

            const read = body.mailId ? await MailService.markRead(guildId, body.uuid, body.mailId) : null;

            return ok({ acknowledged: true as const, requestId: body.requestId, mail: read });
        },
    },
];
