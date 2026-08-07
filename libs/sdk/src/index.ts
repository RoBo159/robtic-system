/**
 * The Robtic SDK: the shared contract between every application in the monorepo.
 *
 * Two independent surfaces live here.
 *
 * - The **Discord Embedded App** layer (`client`, `authentication`), used by `apps/activity` and
 *   exported only from this entry point because it depends on a browser-only package.
 * - The **Robtic API** layer (`api-client`, `dto`, `errors`, `constants`, `validation`, `auth`),
 *   re-exported here for the browser and available on its own from `./api` for server code. The
 *   Java plugin cannot import TypeScript, but mirrors those routes and DTO shapes exactly.
 *
 * Nothing in here may import from `apps/`, and nothing may open a database connection — the SDK
 * describes the contract, it does not implement either side of it.
 */

// Discord Embedded App SDK — browser only.
export { createDiscordSdk } from "./client/create-discord-sdk";
export { authenticateUser } from "./authentication/authenticate-user";
export type { DiscordAuth, DiscordSession } from "./types/discord-auth";

// Robtic API contract.
export * from "./api";
