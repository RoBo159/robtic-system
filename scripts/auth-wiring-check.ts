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
import { readFileSync } from "node:fs";

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

for (const file of [
    "AuthService.java",
    "AuthMenuListener.java",
    "AuthInventoryPrompt.java",
    "AuthRestrictionListener.java",
    "AuthPlacementListener.java",
]) {
    const source = readFileSync(`apps/minecraft-plugin/src/main/java/org/robtic/minecraft/auth/${file}`, "utf8");
    // `[a-z-]+` alone also matches the string "auth.yml", which is a filename rather than a key.
    for (const match of source.matchAll(/"auth\.((?!yml")[a-z-]+)"/g)) referenced.add(match[1]!);
}

const missing = [...referenced].filter(key => !new RegExp(`^\\s{2}${key}:`, "m").test(authSection)).sort();
check(`every auth message key exists (${referenced.size} referenced)`, missing, []);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exitCode = 1;
