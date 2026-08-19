"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where the browser reaches the dashboard API, delivered at runtime rather than compiled in.
 *
 * The obvious alternative is `NEXT_PUBLIC_DASHBOARD_API_URL`, but `NEXT_PUBLIC_*` is substituted by
 * the compiler, which would make the hostname a property of the *image*: one build per environment,
 * a Docker build argument to thread through CI, and a container that silently talks to
 * `localhost:3003` if that argument ever fails to arrive. Reading it on the server and handing it
 * down means one image runs anywhere and a wrong value is a restart to fix, not a rebuild.
 */
const ApiBaseContext = createContext<string | null>(null);

export function ApiConfigProvider({ value, children }: { value: string; children: ReactNode }) {
    return <ApiBaseContext.Provider value={value}>{children}</ApiBaseContext.Provider>;
}

/** Throws rather than defaulting: a silent fallback to localhost is the bug this design removes. */
export function useApiBase(): string {
    const base = useContext(ApiBaseContext);
    if (base === null) throw new Error("useApiBase() used outside ApiConfigProvider — see app/layout.tsx");
    return base;
}
