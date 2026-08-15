import type { ReactNode, SVGProps } from "react";

export type IconName =
    | "user" | "trophy" | "gear" | "shield" | "search" | "chevron-left" | "chevron-down"
    | "fire" | "message" | "zap" | "star" | "clock" | "hammer" | "user-x" | "ban"
    | "check" | "x" | "alert" | "sliders" | "hash" | "at" | "activity" | "scale"
    | "home" | "globe" | "lock" | "pencil" | "folder" | "plus" | "link" | "note" | "rocket"
    | "users" | "chevron-right" | "image" | "coin" | "palette" | "mic";

/** Inner SVG paths per icon — stroke-based line icons that inherit `currentColor`. */
const PATHS: Record<IconName, ReactNode> = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
    trophy: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></>,
    gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" /></>,
    shield: <><path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" /></>,
    scale: <><path d="M12 3v18" /><path d="M7 7h10" /><path d="M7 7l-3 6a3 3 0 0 0 6 0L7 7Z" /><path d="M17 7l-3 6a3 3 0 0 0 6 0l-3-6Z" /><path d="M8 21h8" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>,
    "chevron-left": <path d="m14 6-6 6 6 6" />,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    fire: <path d="M12 3s4 3.5 4 8a4 4 0 0 1-8 0c0-1.4.5-2.4 1-3 .2 1 .8 1.6 1.5 1.6C11 9.6 10 7 12 3Z" />,
    message: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />,
    zap: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
    star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    hammer: <><path d="m14 6 4 4" /><path d="M10.5 9.5 3 17l4 4 7.5-7.5" /><path d="M12.5 7.5 16 4l4 4-3.5 3.5-4-4Z" /></>,
    "user-x": <><circle cx="9" cy="8" r="4" /><path d="M3 21c0-4 3-6 6-6s6 2 6 6" /><path d="m17 8 4 4M21 8l-4 4" /></>,
    ban: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    alert: <><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17.5v.5" /></>,
    sliders: <><path d="M4 6h11M18 6h2M4 12h4M11 12h9M4 18h8M15 18h5" /><circle cx="16" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="13" cy="18" r="1.6" /></>,
    hash: <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />,
    at: <><circle cx="12" cy="12" r="4" /><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" /></>,
    activity: <path d="M3 12h4l3 8 4-16 3 8h4" />,
    home: <><path d="m3 11 9-7 9 7" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-6h4v6" /></>,
    globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5s1.3-6.2 3.8-8.5Z" /></>,
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    pencil: <><path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" /><path d="m14 7 3 3" /></>,
    folder: <path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    link: <><path d="M10 14a5 5 0 0 0 7 .5l2.5-2.5a5 5 0 0 0-7-7L11 6.5" /><path d="M14 10a5 5 0 0 0-7-.5L4.5 12a5 5 0 0 0 7 7L13 17.5" /></>,
    note: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
    rocket: <><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z" /><path d="m12 15-3-3a22 22 0 0 1 2-4 12.9 12.9 0 0 1 11-6c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2Z" /><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0" /><path d="M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" /><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4" /><path d="M18 14.9c2.1.8 3.5 2.4 3.5 5.1" /></>,
    "chevron-right": <path d="m10 6 6 6-6 6" />,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m5 19 5.5-5.5 3 3L17 13l4 4" /></>,
    coin: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.2" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" /></>,
    palette: <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h6.5A2.5 2.5 0 0 0 21 10.5 9 9 0 0 0 12 3Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7.5" r="1" /><circle cx="14.5" cy="7" r="1" /></>,
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3M9 21h6" /></>,
};

interface IconProps extends SVGProps<SVGSVGElement> {
    name: IconName;
    size?: number;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...rest}
        >
            {PATHS[name]}
        </svg>
    );
}
