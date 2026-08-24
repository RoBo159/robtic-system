/**
 * Verifies the RobticAuth flows end to end, with the four collections stubbed in memory.
 *
 * The routes and the service are the real ones — only the repositories are replaced — so this
 * exercises validation, rate limiting, session handling and the recovery state machine as they will
 * actually run. What it deliberately cannot cover is the part that needs a game client: the login
 * GUI, the dialog fallback, and Bedrock.
 *
 * The case worth having a test for above all others is the legacy link: an account linked before
 * RobticAuth existed has no password, must not be locked out, and must be able to set its first one
 * through the same recovery path as somebody who has forgotten theirs. That is asserted below, and
 * it is the one behaviour a refactor here would most easily break without anybody noticing until a
 * player complained.
 */
import {
    ApiRequestLogRepository,
    MinecraftLinkRepository,
    MinecraftPlayerAccountRepository,
    MinecraftPlayerSessionRepository,
    MinecraftRecoveryCodeRepository,
    MinecraftRoleStateRepository,
    RobsRepository,
} from "@database/repositories";
import { authRoutes } from "../apps/minecraft-api/src/controllers/auth-controller";
import { AuthService } from "../apps/minecraft-api/src/services/auth-service";
import { API_ROUTES } from "@sdk";
import type { RequestContext } from "../apps/minecraft-api/src/lib/request-context";

const GUILD = "123456789012345678";
const DISCORD = "222222222222222222";
const UUID = "0f2b4a1c-9d3e-4c5a-8b7f-1e2d3c4b5a69";
const NAME = "Robo";

// ─── In-memory stand-ins for the four collections ─────────────────────────────────────────────

type Link = { guildId: string; discordId: string; minecraftUuid: string; minecraftUsername: string };
let links: Link[] = [];
let accounts: Record<string, Record<string, unknown>> = {};
let sessions: Array<Record<string, unknown>> = [];
let recovery: Array<Record<string, unknown>> = [];

MinecraftLinkRepository.getByUuid = (async (g: string, u: string) =>
    links.find(l => l.guildId === g && l.minecraftUuid === u.toLowerCase()) ?? null) as never;
MinecraftLinkRepository.getByDiscordId = (async (g: string, d: string) =>
    links.find(l => l.guildId === g && l.discordId === d) ?? null) as never;
MinecraftLinkRepository.create = (async (g: string, d: string, u: string, n: string) => {
    const link = { guildId: g, discordId: d, minecraftUuid: u.toLowerCase(), minecraftUsername: n };
    links.push(link);
    return link;
}) as never;
MinecraftLinkRepository.delete = (async (g: string, d: string) => {
    const before = links.length;
    links = links.filter(l => !(l.guildId === g && l.discordId === d));
    return links.length < before;
}) as never;

MinecraftPlayerAccountRepository.ensure = (async (input: Record<string, string>) => {
    const key = input.minecraftUuid!.toLowerCase();
    accounts[key] ??= { failedAttempts: 0 };
    Object.assign(accounts[key]!, {
        minecraftUsername: input.minecraftUsername,
        discordId: input.discordId,
    });
    return accounts[key];
}) as never;
MinecraftPlayerAccountRepository.getWithHash = (async (_g: string, u: string) =>
    accounts[u.toLowerCase()] ?? null) as never;
MinecraftPlayerAccountRepository.setPassword = (async (_g: string, u: string, hash: string) => {
    const account = (accounts[u.toLowerCase()] ??= { failedAttempts: 0 });
    Object.assign(account, { passwordHash: hash, failedAttempts: 0, failedAttemptsSince: undefined });
    return account;
}) as never;
MinecraftPlayerAccountRepository.clearPassword = (async (_g: string, u: string) => {
    const account = accounts[u.toLowerCase()];
    if (!account) return false;
    delete account.passwordHash;
    account.failedAttempts = 0;
    return true;
}) as never;
MinecraftPlayerAccountRepository.recordLogin = (async () => undefined) as never;
MinecraftPlayerAccountRepository.recordFailure = (async (_g: string, u: string) => {
    const account = (accounts[u.toLowerCase()] ??= { failedAttempts: 0 });
    account.failedAttempts = ((account.failedAttempts as number) ?? 0) + 1;
    account.failedAttemptsSince ??= new Date();
    return account.failedAttempts as number;
}) as never;
MinecraftPlayerAccountRepository.delete = (async (_g: string, u: string) => {
    const existed = Boolean(accounts[u.toLowerCase()]);
    delete accounts[u.toLowerCase()];
    return existed;
}) as never;

MinecraftPlayerSessionRepository.create = (async (input: Record<string, unknown>) => {
    const session = { ...input, createdAt: new Date(), lastLoginAt: new Date() };
    sessions.push(session);
    return session;
}) as never;
MinecraftPlayerSessionRepository.accept = (async (g: string, id: string, u: string, ipHash?: string) =>
    sessions.find(
        s =>
            s.guildId === g &&
            s.sessionId === id &&
            s.minecraftUuid === u.toLowerCase() &&
            (s.expiresAt as Date) > new Date() &&
            (s.ipHash ?? undefined) === ipHash,
    ) ?? null) as never;
MinecraftPlayerSessionRepository.acceptByAddress = (async (g: string, u: string, ipHash?: string) =>
    sessions
        .filter(
            s =>
                s.guildId === g &&
                s.minecraftUuid === u.toLowerCase() &&
                (s.expiresAt as Date) > new Date() &&
                (s.ipHash ?? undefined) === ipHash,
        )
        .sort((a, b) => (b.expiresAt as Date).getTime() - (a.expiresAt as Date).getTime())[0] ?? null) as never;
MinecraftPlayerSessionRepository.list = (async (g: string, u: string) =>
    sessions.filter(s => s.guildId === g && s.minecraftUuid === u.toLowerCase())) as never;
MinecraftPlayerSessionRepository.revokeAll = (async (g: string, u: string) => {
    const before = sessions.length;
    sessions = sessions.filter(s => !(s.guildId === g && s.minecraftUuid === u.toLowerCase()));
    return before - sessions.length;
}) as never;
MinecraftPlayerSessionRepository.revoke = (async (g: string, id: string) => {
    const before = sessions.length;
    sessions = sessions.filter(s => !(s.guildId === g && s.sessionId === id));
    return sessions.length < before;
}) as never;

MinecraftRecoveryCodeRepository.issue = (async (input: Record<string, unknown>) => {
    recovery = recovery.filter(r => r.minecraftUuid !== (input.minecraftUuid as string).toLowerCase());
    const row = { ...input, code: MinecraftRecoveryCodeRepository.normalise(input.code as string) };
    recovery.push(row);
    return row;
}) as never;
MinecraftRecoveryCodeRepository.claim = (async (g: string, code: string, discordId: string) => {
    const wanted = MinecraftRecoveryCodeRepository.normalise(code);
    const index = recovery.findIndex(
        r =>
            r.guildId === g &&
            r.code === wanted &&
            r.discordId === discordId &&
            (r.expiresAt as Date) > new Date(),
    );
    if (index < 0) return null;
    return recovery.splice(index, 1)[0];
}) as never;
MinecraftRecoveryCodeRepository.discard = (async () => undefined) as never;

MinecraftRoleStateRepository.remove = (async () => undefined) as never;
RobsRepository.attachDiscordId = (async () => undefined) as never;

const claimedIds = new Set<string>();
ApiRequestLogRepository.claim = (async (id: string) =>
    claimedIds.has(id) ? { replayed: true } : (claimedIds.add(id), null)) as never;
ApiRequestLogRepository.complete = (async () => undefined) as never;
ApiRequestLogRepository.release = (async () => undefined) as never;

// ─── Harness ──────────────────────────────────────────────────────────────────────────────────

function route(method: "GET" | "POST", path: string) {
    const found = authRoutes.find(r => r.method === method && r.path === path);
    if (!found) throw new Error(`${method} ${path} is not registered`);
    return found;
}

function contextFor(path: string, body: unknown = {}): RequestContext {
    const url = new URL(`http://api.test${path}`);
    return {
        request: new Request(url),
        url,
        identity: { guildId: GUILD, serverId: "survival", scopes: ["server", "staff"], label: "probe" } as never,
        body,
        requestId: null,
        serverId: "survival",
        serverName: "Survival",
        pluginVersion: "3.0.1",
    };
}

const identity = { serverId: "survival", serverName: "Survival" };
let checks = 0;
let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

const HOME_IP = "203.0.113.7";
const OTHER_IP = "198.51.100.9";

async function state(sessionId?: string, address = HOME_IP) {
    const query =
        `?guildId=${GUILD}&uuid=${UUID}&username=${NAME}&address=${address}` +
        (sessionId ? `&sessionId=${sessionId}` : "");
    const response = await route("GET", API_ROUTES.auth.state).handler(
        contextFor(API_ROUTES.auth.state + query),
    );
    return (await response.json()).data;
}

async function login(pw: string, requestId = `mc-login:${Math.random()}`, address = HOME_IP) {
    const response = await route("POST", API_ROUTES.auth.login).handler(
        contextFor(API_ROUTES.auth.login, {
            guildId: GUILD, uuid: UUID, username: NAME, password: pw, address, requestId, ...identity,
        }),
    );
    return (await response.json()).data;
}

// ─── The flows ────────────────────────────────────────────────────────────────────────────────

console.log("\n--- unlinked player ---");
check("outcome", (await state()).outcome, "needs_link");
check("login refused", (await login("whatever12")).reason, "not_linked");

console.log("\n--- legacy link: linked before RobticAuth, no password ---");
links.push({ guildId: GUILD, discordId: DISCORD, minecraftUuid: UUID, minecraftUsername: NAME });

const legacy = await state();
check("outcome", legacy.outcome, "needs_password");
check("linked", legacy.linked, true);
check("hasPassword", legacy.hasPassword, false);
check("login says no_password", (await login("guessing1234")).reason, "no_password");

console.log("\n--- forgot password sets the first one ---");
const recoveryResponse = await route("POST", API_ROUTES.auth.recovery).handler(
    contextFor(API_ROUTES.auth.recovery, {
        guildId: GUILD, uuid: UUID, username: NAME, requestId: "mc-recover:1", ...identity,
    }),
);
const issued = (await recoveryResponse.json()).data;
check("code is grouped", /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(issued.code), true);
check("expires in 10 minutes", issued.minutesValid, 10);

await AuthService.redeemRecoveryCode({
    guildId: GUILD, code: issued.code, discordId: DISCORD, newPassword: "correct horse battery",
});
check("outcome after setting", (await state()).outcome, "needs_login");

console.log("\n--- login ---");
check("wrong password", (await login("nope nope nope")).reason, "wrong_password");
const good = await login("correct horse battery");
check("correct password", good.ok, true);
check("session issued", typeof good.session?.sessionId, "string");

console.log("\n--- session resume ---");
const resumed = await state(good.session.sessionId);
check("resumed outcome", resumed.outcome, "authenticated");
check("unknown session falls back", (await state("not-a-real-session")).outcome, "needs_login");

// The join path: no id presented, resolved by address alone. This is what makes a session opened on
// one server in the network honoured on the next, without either of them keeping a file.
check("resumed by address with no id", (await state()).outcome, "authenticated");
check("no session from another address", (await state(undefined, OTHER_IP)).outcome, "needs_login");

// The property the whole session design rests on. A session is presented by the *server* on the
// player's behalf, so without this an impostor connecting under the same name on an offline-mode
// server would be handed the account with the password never once consulted.
check(
    "session refused from another address",
    (await state(good.session.sessionId, OTHER_IP)).outcome,
    "needs_login",
);
check("still accepted from the original", (await state(good.session.sessionId)).outcome, "authenticated");

console.log("\n--- recovery code is single use and bound to the Discord account ---");
const second = await route("POST", API_ROUTES.auth.recovery).handler(
    contextFor(API_ROUTES.auth.recovery, {
        guildId: GUILD, uuid: UUID, username: NAME, requestId: "mc-recover:2", ...identity,
    }),
);
const secondCode = (await second.json()).data.code;

let wrongAccountRejected = false;
try {
    await AuthService.redeemRecoveryCode({
        guildId: GUILD, code: secondCode, discordId: "999999999999999999", newPassword: "another password",
    });
} catch { wrongAccountRejected = true; }
check("wrong Discord account refused", wrongAccountRejected, true);

await AuthService.redeemRecoveryCode({
    guildId: GUILD, code: secondCode, discordId: DISCORD, newPassword: "another password 2",
});
let reuseRejected = false;
try {
    await AuthService.redeemRecoveryCode({
        guildId: GUILD, code: secondCode, discordId: DISCORD, newPassword: "third password",
    });
} catch { reuseRejected = true; }
check("reuse refused", reuseRejected, true);
check("old password no longer works", (await login("correct horse battery")).reason, "wrong_password");
check("new password works", (await login("another password 2")).ok, true);
check("password change ended old sessions", (await state(good.session.sessionId)).outcome, "needs_login");

console.log("\n--- rate limiting ---");
accounts[UUID] = { ...accounts[UUID], failedAttempts: 0, failedAttemptsSince: undefined };
for (let attempt = 0; attempt < 5; attempt++) await login("wrong every time");
const limited = await login("another password 2");
check("correct password refused while limited", limited.reason, "rate_limited");
check("retryAfterMs reported", typeof limited.retryAfterMs, "number");
check("state reports the wait too", typeof (await state()).retryAfterMs, "number");

console.log("\n--- admin ---");
const listed = await AuthService.admin({
    guildId: GUILD, action: "list_sessions", uuid: UUID, username: NAME, actorUsername: "Admin",
});
check("list_sessions returns an array", Array.isArray(listed.sessions), true);

const unlinked = await AuthService.admin({
    guildId: GUILD, action: "force_unlink", uuid: UUID, username: NAME, actorUsername: "Admin",
});
check("unlink summary mentions robs", unlinked.summary.includes("robs balance is untouched"), true);
check("back to needs_link", (await state()).outcome, "needs_link");
check("password removed with the link", accounts[UUID], undefined);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exitCode = 1;
