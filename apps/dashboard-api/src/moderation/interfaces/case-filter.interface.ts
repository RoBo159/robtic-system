import type { PunishmentType } from "./punishment-type.interface";

/**
 * What narrows a case list.
 *
 * An interface rather than the query DTO itself: the DTO is the wire format (everything a string,
 * everything optional) and this is what the repository needs after the service has resolved it.
 * Passing the DTO straight through would make the repository parse query strings.
 */
export interface CaseFilter {
    guildId: string;
    type?: PunishmentType;
    userId?: string;
}
