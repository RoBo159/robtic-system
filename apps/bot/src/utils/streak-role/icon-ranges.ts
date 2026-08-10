import { readdirSync } from "node:fs";
import { join } from "node:path";
import { STREAK_ROLE } from "@constants";

interface StreakIconRange {
    min: number;
    max: number;
    filePath: string;
}

const STREAK_IMAGES_DIR = join(process.cwd(), ...STREAK_ROLE.iconsDirectory);

let cachedRanges: StreakIconRange[] | null = null;

/** Scans images/streak for fire<min>-<max>.png files and builds sorted level ranges. */
function loadIconRanges(): StreakIconRange[] {
    if (cachedRanges) return cachedRanges;

    const ranges: StreakIconRange[] = [];
    let files: string[] = [];
    try {
        files = readdirSync(STREAK_IMAGES_DIR);
    } catch {
        cachedRanges = ranges;
        return ranges;
    }

    for (const file of files) {
        const match = STREAK_ROLE.iconFilenamePattern.exec(file);
        if (!match) continue;
        ranges.push({ min: Number(match[1]), max: Number(match[2]), filePath: join(STREAK_IMAGES_DIR, file) });
    }

    ranges.sort((a, b) => a.min - b.min);
    cachedRanges = ranges;
    return ranges;
}

export function getIconPathForLevel(level: number): string | null {
    const ranges = loadIconRanges();
    if (ranges.length === 0) return null;

    const exact = ranges.find(r => level >= r.min && level <= r.max);
    if (exact) return exact.filePath;

    // Gap between defined ranges, or beyond the highest range: carry forward the last applicable icon.
    const applicable = [...ranges].reverse().find(r => r.min <= level);
    return applicable ? applicable.filePath : ranges[0].filePath;
}
