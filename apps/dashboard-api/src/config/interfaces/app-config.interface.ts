/** How this service is reached, and where it sends people back to. */
export interface AppConfig {
    port: number;
    /** Where the browser reaches this API — the OAuth redirect is built from it. */
    publicApiUrl: string;
    /** Where the browser reaches the Next.js app; also the only permitted CORS origin. */
    dashboardUrl: string;
}
