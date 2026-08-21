/**
 * `GET /auth/me` — who the browser is signed in as.
 *
 * A response DTO, deliberately narrower than `SessionPayload`. Mirrored by `SessionUser` in
 * `apps/dashboard/src/lib/types.ts`; the two are hand-kept in step because the web app compiles with
 * its own tsconfig and importing from here would drag mongoose into its bundle graph.
 */
export interface SessionUserResponse {
    id: string;
    username: string;
    avatar: string | null;
}
