export function creditsFor(usd: number, rate: number): number {
    return Math.round(usd * rate);
}
