import { getAdminConfig, updateAdminConfig } from "@core/admin-config";
import type { AdminConfigSection } from "@typings/admin-config";
import { ADMIN_CONFIG_SECTIONS } from "@constants";
import { authenticateRequest } from "../lib/authenticate-request";
import { isGuildAdmin } from "../lib/is-guild-admin";
import { jsonError, API_ERRORS } from "../lib/json-response";

const SECTIONS: readonly AdminConfigSection[] = ADMIN_CONFIG_SECTIONS;

/** POST /api/admin/config — body { guildId, section, values }. Writes one section, admins only. */
export async function updateAdminConfigRoute(request: Request): Promise<Response> {
    const viewer = await authenticateRequest(request);
    if (!viewer) return jsonError(API_ERRORS.unauthorized, 401);

    const body = await request.json().catch(() => null) as
        { guildId?: string; section?: string; values?: unknown } | null;

    if (!body?.guildId) return jsonError(API_ERRORS.guildRequired, 400);
    if (!body.section || !SECTIONS.includes(body.section as AdminConfigSection)) {
        return jsonError("A valid config section is required", 400);
    }
    if (!body.values || typeof body.values !== "object") {
        return jsonError("A values object is required", 400);
    }

    const admin = await isGuildAdmin(body.guildId, viewer.id);
    if (!admin) return jsonError("Administrator access is required", 403);

    await updateAdminConfig(body.guildId, body.section as AdminConfigSection, body.values as never, viewer.id);

    // Re-read so the client renders exactly what was persisted (after clamping/validation).
    const config = await getAdminConfig(body.guildId);
    return Response.json({ config });
}
