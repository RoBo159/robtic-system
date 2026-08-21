/**
 * What a write endpoint returns when there is nothing to return.
 *
 * Every mutation in this API answers `{ ok: true }` and the dashboard's `apiMutate` ignores the
 * body entirely — the meaning is carried by the status code. Naming the shape stops each controller
 * inventing its own success envelope, which is how one endpoint ends up answering `{ success: true }`
 * and breaking a caller that was written against the others.
 */
export interface AcknowledgementResponse {
    ok: true;
}

/** The single instance every write returns. Frozen so a handler cannot mutate the shared object. */
export const ACKNOWLEDGED: AcknowledgementResponse = Object.freeze({ ok: true });
