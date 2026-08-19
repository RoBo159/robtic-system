"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
    { href: "", label: "Overview" },
    { href: "/settings", label: "Settings" },
    { href: "/moderation", label: "Moderation" },
    { href: "/quests", label: "Quests" },
    { href: "/economy", label: "Economy" },
] as const;

/**
 * A client component only because the active link depends on the current path.
 *
 * `aria-current` rather than a CSS class alone: the highlight is information, and a screen reader
 * that only sees five identical links has lost it.
 */
export function GuildNav({ guildId }: { guildId: string }) {
    const pathname = usePathname();
    const base = `/g/${guildId}`;

    return (
        <>
            <h2>Server</h2>
            {SECTIONS.map(section => {
                const href = `${base}${section.href}`;
                return (
                    <Link key={section.label} href={href} aria-current={pathname === href ? "page" : undefined}>
                        {section.label}
                    </Link>
                );
            })}
        </>
    );
}
