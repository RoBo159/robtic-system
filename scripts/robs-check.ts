/**
 * Keeps the two implementations of rob rounding in agreement.
 *
 * Robs carry two decimal places, and the rule for rounding them exists twice: once in TypeScript
 * (`libs/sdk/src/constants/robs.ts`) for the API and the bot, and once in Java
 * (`org.robtic.minecraft.util.Robs`) for the game server. A JVM cannot import TypeScript, so the
 * duplication is unavoidable — which makes drift between them a matter of time rather than chance.
 *
 * Drift here is expensive and quiet. The plugin computes what a payout is worth and the API decides
 * what to store; if the two round differently, a balance disagrees with the sum of the transactions
 * that produced it, by an amount too small for anyone to notice until it has happened ten thousand
 * times. Nothing else in the toolchain compares them.
 *
 * So the expected values below are stated literally rather than computed. A test that derives its
 * expectation from the code it is testing agrees with any bug that code contains; these are the
 * numbers a player would work out on paper, and the Java suite in `Robs` asserts the same ones.
 *
 * Run with `bun run test:robs`.
 */
import { formatRobs, isValidRobs, roundRobs } from "@sdk/constants/robs";

let failures = 0;

const check = (name: string, got: unknown, want: unknown) => {
    const ok = Object.is(got, want);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? ` = ${got}` : ` — got ${got}, want ${want}`}`);
    if (!ok) failures++;
};

// ─── AFK, which is what forced robs to become decimal ────────────────────────────────────────
//
// At the shipped rate of ten robs an hour. Five minutes floored to zero under the old integer
// currency, which is the bug that started all of this: a player went AFK, came back, and watched
// their balance not move.

const perHour = 10;
const robsFor = (minutes: number) => roundRobs((minutes * 60_000 / 3_600_000) * perHour);

check("AFK 30 seconds", robsFor(0.5), 0.08);
check("AFK 5 minutes", robsFor(5), 0.83);
check("AFK 15 minutes", robsFor(15), 2.5);
check("AFK 60 minutes", robsFor(60), 10);

// ─── Half-up, because that is the rule a player applies in their head ────────────────────────
//
// 1.005 and 2.675 are the classic cases: binary floating point stores both a hair below the decimal
// they print as, so a naive scale-and-round breaks the promise on exactly the inputs somebody is
// most likely to check by hand.

check("rounds 1.005 up", roundRobs(1.005), 1.01);
check("rounds 2.675 up", roundRobs(2.675), 2.68);
check("rounds 0.005 up", roundRobs(0.005), 0.01);
check("rounds 0.004 down", roundRobs(0.004), 0);

// ─── Sales, where a unit price is multiplied by a stack ──────────────────────────────────────

check("0.07 x 64", roundRobs(0.07 * 64), 4.48);
check("12.5 x 3", roundRobs(12.5 * 3), 37.5);

// ─── Accumulation must not drift ─────────────────────────────────────────────────────────────
//
// A balance is built from many small credits. Rounding at each step is what keeps the error bounded
// at half a hundredth instead of growing with the number of transactions.

let running = 0;
for (let i = 0; i < 10_000; i++) running = roundRobs(running + 0.83);
check("10,000 credits of 0.83", running, 8_300);

check("0.1 + 0.2", roundRobs(0.1 + 0.2), 0.3);

// ─── Validity ────────────────────────────────────────────────────────────────────────────────

check("0.83 is a legal amount", isValidRobs(0.83), true);
check("0.833 is not", isValidRobs(0.833), false);
check("a negative amount is not", isValidRobs(-1), false);
check("NaN is not", isValidRobs(Number.NaN), false);

// ─── Display ─────────────────────────────────────────────────────────────────────────────────
//
// A whole amount must read exactly as it did before the currency gained decimals, or every existing
// message on the server becomes noisier for the majority of amounts that are still whole.

check("whole amounts keep their old form", formatRobs(5_000), "5,000");
check("one decimal place", formatRobs(1_240.5), "1,240.5");
check("two decimal places", formatRobs(0.83), "0.83");
check("trailing zeros are dropped", formatRobs(12.1), "12.1");

console.log(
    failures === 0
        ? "\nAll rob rounding checks passed — the TypeScript and Java rules agree."
        : `\n${failures} rob rounding check(s) FAILED.`,
);

if (failures > 0) process.exit(1);
