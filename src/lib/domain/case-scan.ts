import { fundingGapUsd, type CaseProfile } from "./case";
import { isForeignResident } from "./probes";

/**
 * Case Scan: where the officer is likely to press. Deliberately no approval
 * probability. Each flag points at the probes that will test it.
 */

export type FlagSeverity = "high" | "medium" | "low";

export interface CaseFlag {
  id: string;
  severity: FlagSeverity;
  title: string;
  detail: string;
  probes: string[];
}

export function scanCase(c: CaseProfile): CaseFlag[] {
  const flags: CaseFlag[] = [];
  const sponsor = c.funding.sponsors[0];

  const gap = fundingGapUsd(c);
  if (gap > 0) {
    flags.push({
      id: "funding_gap",
      severity: "high",
      title: "Funding doesn't cover year one",
      detail: `Documented funds${c.study?.scholarshipUsd ? " plus your scholarship" : ""} are about $${gap.toLocaleString("en-US")} short of the I-20 first-year cost. Practice won't fix this; the evidence has to.`,
      probes: ["f1.funding.gap", "f1.funding.sponsor"],
    });
  }

  if (c.funding.recentLargeDepositUsd && c.funding.recentLargeDepositUsd > 0.3 * c.funding.liquidFundsUsd) {
    flags.push({
      id: "large_deposit",
      severity: "medium",
      title: "Large recent deposit",
      detail: "A big lump sum shortly before applying invites questions about where it came from.",
      probes: ["f1.funding.deposit"],
    });
  }

  if (!sponsor || !sponsor.occupation) {
    flags.push({
      id: "unclear_sponsor",
      severity: "medium",
      title: "Sponsor isn't clear",
      detail: "Be ready to say who pays, what they do, and roughly what they earn.",
      probes: c.visaType === "F1" ? ["f1.funding.sponsor"] : ["b.funding.trip"],
    });
  }

  const hasTies =
    Boolean(c.ties.employer) || c.ties.ownsBusiness || c.ties.ownsProperty || c.applicant.children > 0;
  if (!hasTies) {
    flags.push({
      id: "weak_ties",
      severity: c.visaType === "B1B2" ? "high" : "medium",
      title: "Few documented ties to Ghana",
      detail: "The officer will look hard for your reason to return.",
      probes: c.visaType === "F1" ? ["f1.career.after"] : ["b.ties.work", "b.wildcard.return"],
    });
  }

  if (c.history.priorRefusals.length > 0) {
    flags.push({
      id: "prior_refusal",
      severity: "high",
      title: "Previous refusal on record",
      detail: "The officer can see it. You need a material change, not a better speech.",
      probes: ["common.history.refusal"],
    });
  }

  if (isForeignResident(c)) {
    flags.push({
      id: "foreign_resident",
      severity: "high",
      title: "Applying outside your home country",
      detail:
        "Since September 2025 you must apply where you're a national or resident. Be ready to show you really live in Ghana: how long, on what permit, and what you do here.",
      probes: ["common.residence"],
    });
  }

  if (c.visit && c.visit.durationDays > 60) {
    flags.push({
      id: "long_visit",
      severity: "medium",
      title: "Long intended stay",
      detail: `${c.visit.durationDays} days needs a clear reason and a clear return date.`,
      probes: ["b.purpose.duration"],
    });
  }

  if (c.usContacts.length > 0) {
    flags.push({
      id: "us_family",
      severity: "low",
      title: "Relatives in the US",
      detail: "Mention them honestly and consistently with your DS-160.",
      probes: ["common.us_contacts"],
    });
  }

  if (c.visaType === "F1") {
    flags.push({
      id: "social_media",
      severity: "low",
      title: "Social media must be public",
      detail: "Student applicants must set social media accounts to public before the interview, and officers check they match the application. Use the Social media check.",
      probes: [],
    });
  }

  const order: Record<FlagSeverity, number> = { high: 0, medium: 1, low: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}
