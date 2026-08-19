import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ApiConfigProvider } from "@/lib/api-config";
import { publicApiUrl } from "@/lib/api.server";
import "./globals.css";

export const metadata: Metadata = {
    title: "Robtic Dashboard",
    description: "Configure the Robtic bot for your server",
};

/**
 * Nothing is prerendered at build time.
 *
 * `publicApiUrl()` reads the environment during render, and a statically prerendered page would
 * capture whatever the value was inside the Docker build — which is precisely the build-time
 * baking this design exists to avoid. Every page but the landing one is already dynamic because it
 * reads cookies; this makes that one honest too.
 */
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                {/* Read on the server on every request, so the same image serves any environment. */}
                <ApiConfigProvider value={publicApiUrl()}>{children}</ApiConfigProvider>
            </body>
        </html>
    );
}
