import type { PanelDefinition } from "@typings/panel";
import { buildAuthPanelContainer } from "@bot/components/minecraft/auth-panel.component";

/**
 * The permanent `#link-account` panel.
 *
 * <h2>A panel definition rather than a command of its own</h2>
 *
 * `/panels send link-account` already does everything posting this needs — channel selection,
 * permission checks, a record of what was posted where, and `/panels delete` to take it down. A
 * dedicated command would have reimplemented all of it for one message.
 *
 * <h2>"container" mode, because the buttons are the panel</h2>
 *
 * The default "embed" mode posts a summary with a button that *reveals* the content on click. That
 * is wrong here: the three actions have to be reachable in one press by somebody who is locked out
 * of the game and reading on a phone. Container mode posts the real thing directly.
 *
 * The buttons' handlers live beside their modals in `components/minecraft/`, not here — this file
 * decides where the panel appears, and that one decides what it does.
 */
export default {
    key: "link-account",
    name: "🔗 Minecraft Account",
    mode: "container",
    accentColor: 0x2ecc71,
    getContent() {
        return buildAuthPanelContainer();
    },
} satisfies PanelDefinition;
