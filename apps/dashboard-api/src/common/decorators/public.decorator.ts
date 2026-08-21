import { SetMetadata } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../constants";

/**
 * Opts a route out of the global `SessionGuard`.
 *
 * The default is deliberately the other way round — every route needs a session unless it says
 * otherwise — so that adding a controller cannot accidentally expose guild data. Only the login
 * handshake and the health probe carry this.
 *
 * In `common/` rather than in `auth/` because it is applied by controllers that have nothing to do
 * with authentication: `HealthController` needs it, and so would any future public route. The guard
 * that reads it stays in `auth/`, which is the correct direction — a feature may declare itself
 * public without depending on how that is enforced.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
