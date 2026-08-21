/**
 * The Robtic SDK: the shared contract between every application in the monorepo.
 *
 * Two independent surfaces live here.
 *
 * - The **Discord Embedded App** layer (`client`, `authentication`), exported only from this entry
 *   point because it depends on a browser-only package. Its consumer — the Embedded Activity —
 *   has been removed; the layer is kept because it is the whole contract for that surface and
 *   deleting it would mean rewriting it from scratch to bring one back.
 * - The **Robtic API** layer (`api-client`, `dto`, `errors`, `constants`, `validation`, `auth`),
 *   re-exported here for the browser and available on its own from `./api` for server code. The
 *   Java plugin cannot import TypeScript, but mirrors those routes and DTO shapes exactly.
 *
 * Nothing in here may import from `apps/`, and nothing may open a database connection — the SDK
 * describes the contract, it does not implement either side of it.
 */

export { createDiscordSdk } from "./client/create-discord-sdk";
export { authenticateUser } from "./authentication/authenticate-user";
export type { DiscordAuth, DiscordSession } from "./types/discord-auth";

export * from "./api";
