/** Single source of truth for what's on sale (docs/PRICING.md). Prices in GHS, VAT inclusive. */
import { CREDIT_VALIDITY_DAYS, PACKS, type PackId } from "@/lib/domain/credits";
import { FREE_DRILLS_PER_ACCOUNT } from "@/lib/domain/entitlement";

export interface Plan {
  id: "free" | PackId;
  name: string;
  priceGhs: number;
  summary: string;
  features: string[];
  featured?: boolean;
}

const months = Math.round(CREDIT_VALIDITY_DAYS / 30.5);
const pack = (id: PackId, summary: string, featured = false): Plan => ({
  id,
  name: PACKS[id].name,
  priceGhs: PACKS[id].priceGhs,
  summary,
  features: [
    `${PACKS[id].interviews} full interviews (real, practice or dress rehearsal)`,
    `${PACKS[id].drills} one-question drills`,
    "Full debriefs, playback and readiness",
    `Use them within ${months} months`,
  ],
  featured,
});

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceGhs: 0,
    summary: "See how the officer will read your case, and try one interview.",
    features: ["Case Scan and what-to-bring list", "One mock interview with a full debrief", `${FREE_DRILLS_PER_ACCOUNT} drills`],
  },
  pack("prep", "Enough to find your weak answers and fix them."),
  pack("full", "Enough to get every key answer solid with different officers, then a dress rehearsal.", true),
  pack("topup", "More interviews when you need them. Adds to what you have."),
];

export const PURCHASABLE: PackId[] = ["prep", "full", "topup"];

export const formatGhs = (n: number) => (n === 0 ? "Free" : `GH₵${n.toLocaleString("en-GH")}`);
