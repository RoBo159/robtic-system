import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "dashboard:public";

/**
 * Opts a route out of the global SessionGuard.
 *
 * The default is deliberately the other way round — every route needs a session unless it says
 * otherwise — so that adding a controller cannot accidentally expose guild data. Only the login
 * handshake and the health probe carry this.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
