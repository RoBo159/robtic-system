import { PRICING_MESSAGES } from "@constants";
import { creditsFor } from "./credits-for";

export function formatPrice(usd: number, rate: number): string {
    return PRICING_MESSAGES.priceWithCredits(usd, creditsFor(usd, rate).toLocaleString());
}
