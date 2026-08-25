/**
 * Verifies that RobticAuth's Discord surface is actually reachable.
 *
 * Every part of this is wired by convention rather than by an import someone can see: panels are
 * discovered by scanning a folder, component handlers by scanning exports, and the plugin's bridge
 * handlers by a string key that has to match a string the bot writes. All three are the kind of
 * connection that compiles perfectly while being silently disconnected — which is exactly what
 * happened to the mailbox — so they are asserted here rather than assumed.
 */
import { ensurePanelsLoaded, getPanel, getPanelKeys } from "@bot/features/panels/registry";
import { MINECRAFT_BRIDGE_EVENT_TYPES } from "@database/models/MinecraftBridgeEvent";
import {
    AUTH_MODAL_IDS,
    AUTH_PANEL_IDS,
    authChangePasswordButtonHandler,
    authLinkButtonHandler,
    authUnlinkButtonHandler,
    buildAuthPanelContainer,
} from "@bot/components/minecraft/auth-panel.component";
import {
    authChangePasswordModalHandler,
    authLinkModalHandler,
    authUnlinkModalHandler,
} from "@bot/components/minecraft/auth-modals.component";
import { existsSync, readdirSync, readFileSync } from "node:fs";

let checks = 0;
let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
    checks++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

console.log("--- the panel is discoverable by /panels send ---");
await ensurePanelsLoaded();
const panel = await getPanel("link-account");
check("panel registered", Boolean(panel), true);
// Autocomplete choices, so this is a list of {name, value} rather than of keys.
check(
    "listed for autocomplete",
    (await getPanelKeys()).some(choice => choice.value === "link-account"),
    true,
);
check("posts its buttons directly", panel?.mode, "container");
check("renders without throwing", typeof buildAuthPanelContainer(), "object");

console.log("\n--- every button opens a modal that has a handler ---");
const buttons = [authLinkButtonHandler, authChangePasswordButtonHandler, authUnlinkButtonHandler];
const modals = [authLinkModalHandler, authChangePasswordModalHandler, authUnlinkModalHandler];

check("three buttons", buttons.length, 3);
check(
    "button ids match the panel",
    buttons.map(handler => handler.customId).sort(),
    Object.values(AUTH_PANEL_IDS).sort(),
);
check(
    "modal handlers match the ids the buttons show",
    modals.map(handler => handler.customId).sort(),
    Object.values(AUTH_MODAL_IDS).sort(),
);
// Widened to the shape the loader actually tests for, because that is all this is asserting: the
// two arrays are handlers for different interaction types and do not share a concrete generic.
const everyHandler: Array<{ customId: string | RegExp; run: unknown }> = [...buttons, ...modals];

check("every handler is runnable", everyHandler.every(handler => typeof handler.run === "function"), true);

// The loader registers any named export shaped like a handler, so a duplicate id would silently
// shadow one of these — the collision is reported at boot but nothing fails.
const ids = everyHandler.map(handler => String(handler.customId));
check("no duplicate custom ids", new Set(ids).size, ids.length);

console.log("\n--- the bridge carries the three auth events, end to end ---");
for (const type of ["account_linked", "password_changed", "account_unlinked"] as const) {
    check(`"${type}" is a valid event type`, MINECRAFT_BRIDGE_EVENT_TYPES.includes(type), true);
}

// The plugin side is Java, so the only thing that can be asserted from here is that the string keys
// it dispatches on are the same ones the bot publishes. A typo on either side is a message that is
// queued, claimed and then silently ignored.
const consumer = readFileSync(
    "apps/minecraft-plugin/src/main/java/org/robtic/minecraft/service/BridgeConsumerService.java",
    "utf8",
);

for (const type of ["account_linked", "password_changed", "account_unlinked"] as const) {
    check(`the plugin handles "${type}"`, consumer.includes(`handlers.put("${type}"`), true);
}

console.log("\n--- /auth reaches the API ---");

const adminCommands = readFileSync(
    "apps/minecraft-plugin/src/main/java/org/robtic/minecraft/auth/AuthAdminCommands.java",
    "utf8",
);

// The five actions the spec asks for, and the names the API validates against. A verb the command
// offers but the API rejects is a command that fails only when somebody runs it.
for (const action of ["force_link", "force_unlink", "reset_password", "reset_session", "list_sessions"] as const) {
    check(`/auth can send "${action}"`, adminCommands.includes(`"${action}"`), true);
}

// Bukkit silently ignores an executor bound to a command that is not declared, and declares a
// command with no executor as "unknown command" at runtime. Both compile.
const pluginYml = readFileSync("apps/minecraft-plugin/src/main/resources/plugin.yml", "utf8");
const mainClass = readFileSync(
    "apps/minecraft-plugin/src/main/java/org/robtic/minecraft/RobticMinecraftPlugin.java",
    "utf8",
);

check("/auth is declared in plugin.yml", /^\s{2}auth:/m.test(pluginYml), true);
check("/auth is bound to an executor", mainClass.includes('bind("auth"'), true);
check(
    "/auth is permission-gated",
    /^\s{2}auth:[\s\S]*?permission:\s*robtic\.auth\.admin/m.test(pluginYml),
    true,
);
check("robtic.auth.admin is declared", pluginYml.includes("robtic.auth.admin:"), true);

// Every message key the auth code asks for has to exist, or the catalog renders a visible
// "<missing message>" placeholder to a player who is already locked out and confused.
const messages = readFileSync("apps/minecraft-plugin/src/main/resources/messages.yml", "utf8");
const authSection = messages.slice(messages.indexOf("\nauth:"), messages.indexOf("\nchat:"));

const referenced = new Set<string>();
for (const source of [adminCommands, consumer, mainClass]) {
    // `[a-z-]+` alone also matches the string "auth.yml", which is a filename rather than a key.
    for (const match of source.matchAll(/"auth\.((?!yml")[a-z-]+)"/g)) referenced.add(match[1]!);
}

// Scanned rather than listed: a hard-coded file list goes stale the moment a surface is added or
// removed, and the check would then quietly stop covering it.
for (const file of readdirSync("apps/minecraft-plugin/src/main/java/org/robtic/minecraft/auth")) {
    // AuthSettings reads auth.yml, where "auth.enabled" and friends are *config* paths that share
    // the prefix but are not message keys at all.
    if (file === "AuthSettings.java") continue;

    const source = readFileSync(`apps/minecraft-plugin/src/main/java/org/robtic/minecraft/auth/${file}`, "utf8");
    // `[a-z-]+` alone also matches the string "auth.yml", which is a filename rather than a key.
    for (const match of source.matchAll(/"auth\.((?!yml")[a-z-]+)"/g)) referenced.add(match[1]!);
}

const missing = [...referenced].filter(key => !new RegExp(`^\\s{2}${key}:`, "m").test(authSection)).sort();
check(`every auth message key exists (${referenced.size} referenced)`, missing, []);

console.log("\n--- the login UX cannot deadlock ---");

const authDir = "apps/minecraft-plugin/src/main/java/org/robtic/minecraft/auth";
const read = (file: string) => readFileSync(`${authDir}/${file}`, "utf8");

const dialog = read("AuthDialogPrompt.java");
const chat = read("AuthChatPrompt.java");
const router = read("AuthPromptRouter.java");
const restrictions = read("AuthRestrictionListener.java");

// The bug: the instruction screen reopened itself on close, so a player told to run /link could
// never reach chat to run it. Nothing may reopen a prompt on a close event ever again.
check("no inventory close handler survives", existsSync(`${authDir}/AuthMenuListener.java`), false);
check("the anvil prompt is gone", existsSync(`${authDir}/AuthInventoryPrompt.java`), false);
check("no inventory holder remains", existsSync(`${authDir}/AuthMenuHolder.java`), false);
check("nothing references an anvil", /Anvil|ANVIL/.test(dialog + chat + router + restrictions), false);
check("the router never re-shows on its own", /reshow|InventoryCloseEvent/.test(router), false);

// The instruction screen must be dismissable and must carry the action it asks for, rather than
// telling the player to type a command it prevents.
check("instructions are closable", dialog.includes("canCloseWithEscape(true)"), true);
check("instructions run /link for the player", dialog.includes('commandTemplate("link")'), true);

// The login screen may be modal precisely because the password field is inside it.
check("login is modal", dialog.includes("canCloseWithEscape(false)"), true);
check("every screen dismisses itself", dialog.includes("DialogAfterAction.CLOSE"), true);

console.log("\n--- legacy linked accounts are a migration, not an error ---");

// linked && no password must reach a "complete setup" screen, never a scolding.
check("a setup screen exists", dialog.includes("completeSetup"), true);
// Spans lines: the code has to be requested before the screen carrying it can be drawn.
check("NEEDS_PASSWORD routes to it", /NEEDS_PASSWORD[\s\S]{0,240}?completeSetup/.test(dialog), true);
// Anchored on the method rather than on any mention of it, so the window cannot run past the end
// of the screen it is meant to be checking.
check(
    "the setup screen carries a password field",
    /private Dialog completeSetup[\s\S]*?DialogInput\.text/.test(dialog),
    true,
);
check("the chat fallback has one too", chat.includes("completeSetup"), true);

const authMessages = readFileSync("apps/minecraft-plugin/src/main/resources/messages.yml", "utf8");
const authBlock = authMessages.slice(authMessages.indexOf("\nauth:"), authMessages.indexOf("\nchat:"));

// The exact sentence the user reported. It framed a normal migration state as the player's fault.
check(
    'the "you have not set a password" wording is gone',
    /you have not set a password/i.test(authBlock),
    false,
);
check("setup wording explains the migration", /linked before password/i.test(authBlock), true);
check("a first-password code reads as setup, not recovery", authBlock.includes("setup-code-issued:"), true);

console.log("\n--- one owner decides who can see whom ---");

const pluginSrc = "apps/minecraft-plugin/src/main/java/org/robtic/minecraft";
const visibility = readFileSync(`${pluginSrc}/lobby/PlayerVisibilityService.java`, "utf8");
const vanish = readFileSync(`${pluginSrc}/staff/VanishService.java`, "utf8");

// Four features decide visibility. While each computed its own pairs, the last pass to run won —
// so a vanished admin was revealed by an unrelated AFK recompute. Only one class may call
// show/hidePlayer, or that bug comes straight back.
const callers = ["afk", "auth", "staff", "lobby", "listener", "survival"].flatMap(dir => {
    const path = `${pluginSrc}/${dir}`;
    return existsSync(path)
        ? readdirSync(path)
              .filter(file => file.endsWith(".java"))
              .filter(file => /\.(?:show|hide)Player\(/.test(readFileSync(`${path}/${file}`, "utf8")))
              .map(file => `${dir}/${file}`)
        : [];
});

check("only the visibility service touches player visibility", callers, ["lobby/PlayerVisibilityService.java"]);
check("it accounts for vanish", /vanished\.test/.test(visibility), true);
check("it accounts for AFK and auth", /isolated\(/.test(visibility), true);
check("vanish delegates rather than computing", /refreshVisibility\.run\(\)/.test(vanish), true);

console.log("\n--- /hide and /fly are reachable ---");

for (const [cmd, node] of [["hide", "robtic.staff.vanish"], ["fly", "robtic.staff.fly"]] as const) {
    check(`/${cmd} is declared`, new RegExp(`^\\s{2}${cmd}:`, "m").test(pluginYml), true);
    check(`/${cmd} is bound`, mainClass.includes(`bind("${cmd}"`) || /StaffCommands/.test(mainClass), true);
    check(`${node} is declared`, pluginYml.includes(`${node}:`), true);
}

check("granting flight to others is a separate node", pluginYml.includes("robtic.staff.fly.others:"), true);
check("vanishing moves staff to the admin gate", /teleportToGate/.test(vanish), true);

console.log("\n--- no screen depends on a network call to render ---");

// The bug: the legacy screen was only drawn inside the recovery callback, so a failed request meant
// no screen at all — the player saw nothing and could not act. Rendering must never be downstream of
// an API result.
check(
    "the setup dialog draws from memory, not from a callback",
    /NEEDS_PASSWORD -> player\.showDialog\(completeSetup\(auth\.heldCode/.test(dialog),
    true,
);
check("a held code is a plain memory read", /public RecoveryCode heldCode/.test(read("AuthService.java")), true);
check(
    "the chat fallback prints before it fetches",
    /chat-setup-intro[\s\S]{0,400}?requestRecovery/.test(chat),
    true,
);

console.log("\n--- robtic.tester ---");

check("the node is declared", pluginYml.includes("robtic.tester:"), true);
check("it is op-only", /robtic\.tester:[\s\S]{0,200}?default:\s*op/.test(pluginYml), true);

// Granted via Bukkit permission children rather than `*`, which would also hand out other plugins'
// nodes. Every command node the plugin declares must be a child, or a tester hits a wall on it.
const declaredNodes = [...pluginYml.matchAll(/^ {2}(robtic\.[a-z.]+):/gm)]
    .map(match => match[1]!)
    .filter(node => node !== "robtic.tester");
const testerChildren = new Set(
    [...(pluginYml.match(/robtic\.tester:[\s\S]*?(?=\n {2}robtic\.afk\.admin:)/) ?? [""])[0]
        .matchAll(/^ {6}(robtic\.[a-z.]+):\s*true/gm)].map(match => match[1]!),
);

check(
    "every permission is a child of it",
    declaredNodes.filter(node => !testerChildren.has(node)),
    [],
);
check(
    "premium limits are lifted for testers",
    /tester\.test\(uuid\)[\s\S]{0,120}?Entitlements\.tester\(\)/.test(
        readFileSync(`${pluginSrc}/survival/SurvivalCacheService.java`, "utf8"),
    ),
    true,
);

console.log("\n--- the password is asked for before the world loads ---");

const preJoin = read("AuthConfigurationListener.java");

check("it hooks the configuration phase", preJoin.includes("AsyncPlayerConnectionConfigureEvent"), true);
check("it shows a dialog to the connection", /getAudience\(\)\.showDialog/.test(preJoin), true);
check("responses arrive as PlayerCustomClickEvent", preJoin.includes("PlayerCustomClickEvent"), true);

// The three ways this could lock somebody out permanently. Each must be handled.
check(
    "Bedrock is passed through, not held",
    /getMostSignificantBits\(\) == 0L[\s\S]{0,120}?return;/.test(preJoin),
    true,
);
check("the wait is bounded", preJoin.includes("completeOnTimeout"), true);
check("a dropped connection releases the thread", preJoin.includes("PlayerConnectionCloseEvent"), true);
check("a failed dialog does not hang the connection", /catch \(RuntimeException/.test(preJoin), true);

// An outage must refuse, never admit — the same rule the in-world path follows.
check(
    "an unreachable API disconnects rather than letting them in",
    /state == null[\s\S]*?disconnect/.test(preJoin),
    true,
);

// Only players who already have a password are held; anyone needing Discord goes to the link world.
check(
    "only NEEDS_LOGIN is held at the dialog",
    /outcome\(\) != AuthState\.Outcome\.NEEDS_LOGIN[\s\S]{0,80}?return;/.test(preJoin),
    true,
);

check("it can be turned off", /preJoinLogin\(\)/.test(preJoin), true);
check(
    "it is only registered when dialogs exist",
    /preJoinLogin\(\) && platform\.supportsDialogs\(\)/.test(mainClass),
    true,
);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exitCode = 1;
