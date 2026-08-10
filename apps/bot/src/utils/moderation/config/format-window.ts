import { DURATION_UNIT_MS } from "@constants";

export function formatWindow(ms: number): string {
    if (ms % DURATION_UNIT_MS.d === 0) return `${ms / DURATION_UNIT_MS.d}d`;
    if (ms % DURATION_UNIT_MS.h === 0) return `${ms / DURATION_UNIT_MS.h}h`;
    if (ms % DURATION_UNIT_MS.m === 0) return `${ms / DURATION_UNIT_MS.m}m`;
    return `${Math.max(1, Math.floor(ms / DURATION_UNIT_MS.s))}s`;
}
