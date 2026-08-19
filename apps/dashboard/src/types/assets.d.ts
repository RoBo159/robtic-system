/**
 * Ambient declarations for non-code imports.
 *
 * Next.js turns `import "./globals.css"` into a build step rather than a module, so TypeScript has
 * nothing to resolve. Recent TypeScript reports that as an error on side-effect imports instead of
 * ignoring it, and `next-env.d.ts` does not cover the case.
 */
declare module "*.css";
declare module "*.svg" {
    const content: string;
    export default content;
}
