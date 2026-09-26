import type { CaseProfile } from "./case";
import { fillTemplate, isFillable, probesFor } from "./probes";

/**
 * What to bring to the US Embassy in Accra, built from the applicant's case.
 * Officers rarely look at supporting documents (answers decide most
 * interviews), but a missing required item can mean a 221(g), and fumbling
 * through a folder looks unprepared. Sources: travel.state.gov student and
 * visitor visa pages; US Embassy Ghana nonimmigrant visa instructions.
 */

/** Checklist item ids are stored on the case; this is what the server accepts. */
export const CHECKLIST_ID = /^[a-z0-9_]{1,40}$/;

export type ChecklistGroup = "Required" | "Likely to be asked for" | "Good to have";

export interface ChecklistItem {
  id: string;
  label: string;
  why: string;
  group: ChecklistGroup;
  /** The upload kind that covers it, to tick it off. */
  docKind?: string;
}

export function whatToBring(c: CaseProfile): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: "passport",
      label: "Passport, valid at least six months beyond your stay",
      why: "Handed over first. Bring old passports with US or other visas too.",
      group: "Required",
      docKind: "passport_bio",
    },
    { id: "ds160", label: "DS-160 confirmation page (with barcode)", why: "Checked at the entrance and at the window.", group: "Required", docKind: "ds160" },
    {
      id: "appointment",
      label: "Appointment confirmation",
      why: "Needed to get into the embassy.",
      group: "Required",
      docKind: "appointment_confirmation",
    },
    { id: "fee", label: "Visa application fee (MRV) receipt", why: "Proof the fee is paid.", group: "Required" },
    { id: "photo", label: "One 5 × 5 cm (2 × 2 inch) photo", why: "Only if your DS-160 photo upload failed, but carry one anyway.", group: "Good to have" },
  ];

  if (c.visaType === "F1") {
    items.push(
      { id: "i20", label: "Form I-20, signed by you", why: "Handed over with the passport. Unsigned I-20s get sent back.", group: "Required", docKind: "i20" },
      { id: "sevis", label: "SEVIS I-901 fee receipt", why: "The officer checks the fee is paid.", group: "Required" },
      {
        id: "academics",
        label: "Transcripts, WASSCE results, certificates and test scores (SAT, TOEFL, IELTS, Duolingo)",
        why: "Officers may check your academic preparation and English.",
        group: "Likely to be asked for",
        docKind: "academic_record",
      },
      { id: "admission", label: "Admission letter", why: "Backs up your answers about the school.", group: "Good to have", docKind: "admission_letter" },
    );
    if (c.study?.scholarshipUsd) {
      items.push({
        id: "scholarship",
        label: "Scholarship or financial aid award letter",
        why: "Shows what the award covers, whether it renews and what it takes to keep it.",
        group: "Likely to be asked for",
        docKind: "scholarship_letter",
      });
    }
  }

  if (c.visaType === "B1B2") {
    if (c.visit?.hostRelationship) {
      items.push({
        id: "invitation",
        label: "Invitation letter from your host, with their status in the US",
        why: "Not required, but backs up who you're visiting and why.",
        group: "Good to have",
        docKind: "invitation_letter",
      });
    }
    items.push({ id: "itinerary", label: "A rough travel plan (dates, where you'll stay)", why: "Don't buy tickets before the visa.", group: "Good to have" });
    if (/business|conference|meeting|training|workshop|trade|summit|client|partner/i.test(c.visit?.purpose ?? "")) {
      items.push({
        id: "business_trip",
        label: "Letter from your employer or the inviting company about the trip, and any conference registration",
        why: "Says who you're meeting, why, and who pays. You won't be paid in the US.",
        group: "Likely to be asked for",
        docKind: "invitation_letter",
      });
    }
    if (!c.ties.employer && !c.ties.ownsBusiness) {
      items.push({
        id: "income",
        label: "Proof of your own income: pension statement, rent received, or farm or trading records",
        why: "Without a job, the officer looks for what supports your life in Ghana.",
        group: "Likely to be asked for",
      });
    }
  }

  const sponsor = c.funding.sponsors[0];
  const selfFunded = !sponsor || /^self$/i.test(sponsor.relationship);
  items.push({
    id: "bank",
    label: selfFunded ? "Your bank statements (last 6 months)" : `Your ${sponsor!.relationship}'s bank statements (last 6 months)`,
    why: "The most common document officers ask to see.",
    group: "Likely to be asked for",
    docKind: "bank_statement",
  });
  if (!selfFunded) {
    items.push(
      {
        id: "sponsor_letter",
        label: `Sponsor letter or affidavit of support from your ${sponsor!.relationship}`,
        why: "States who pays and how much.",
        group: "Likely to be asked for",
        docKind: "sponsor_letter",
      },
      {
        id: "sponsor_income",
        label: `Proof of your ${sponsor!.relationship}'s income (payslips, business registration or tax records)`,
        why: "A balance means more when the income behind it is clear.",
        group: "Good to have",
      },
    );
    if (!/^(father|mother|parent|parents|dad|mum|mom)$/i.test(sponsor!.relationship)) {
      items.push({
        id: "relationship",
        label: `Proof of how you're related to your ${sponsor!.relationship} (e.g. birth certificates)`,
        why: "Sponsors who aren't parents get asked why they're paying.",
        group: "Good to have",
      });
    }
  }
  if (c.funding.recentLargeDepositUsd) {
    items.push({
      id: "deposit_source",
      label: "Proof of where the recent large deposit came from (sale agreement, loan letter, transfer record)",
      why: "A sudden lump sum is the first thing an officer asks about in a statement.",
      group: "Likely to be asked for",
    });
  }

  if (c.ties.employer) {
    items.push({
      id: "employment",
      label: `Letter from ${c.ties.employer} confirming your job${c.visaType === "B1B2" ? " and approved leave dates" : ""}, plus recent payslips`,
      why: "Your job is your strongest reason to come back.",
      group: c.visaType === "B1B2" ? "Likely to be asked for" : "Good to have",
      docKind: "employment_letter",
    });
  }
  if (c.ties.ownsBusiness) {
    items.push({
      id: "business",
      label: "Business registration, recent tax records and business bank statements",
      why: "Shows the business is real and running.",
      group: "Good to have",
      docKind: "business_registration",
    });
  }
  if (c.ties.ownsProperty) {
    items.push({ id: "property", label: "Property documents (title, lease or indenture)", why: "A tie to Ghana.", group: "Good to have", docKind: "property" });
  }
  if (c.applicant.maritalStatus === "married" || c.applicant.children > 0) {
    items.push({
      id: "family",
      label: "Marriage and children's birth certificates",
      why: "Family staying in Ghana is a tie; bring proof if asked.",
      group: "Good to have",
    });
  }
  if (c.history.priorRefusals.length) {
    items.push({
      id: "refusal",
      label: "Your previous refusal letter, and proof of what has changed since",
      why: "The officer sees the refusal. What changed is the question.",
      group: "Likely to be asked for",
      docKind: "refusal_letter",
    });
  }

  const order: Record<ChecklistGroup, number> = { Required: 0, "Likely to be asked for": 1, "Good to have": 2 };
  return items.sort((a, b) => order[a.group] - order[b.group]);
}

/** The questions this case is most likely to get: key topics first, most relevant first. */
export function likelyQuestions(c: CaseProfile, count = 6): { id: string; question: string; key: boolean }[] {
  return probesFor(c.visaType)
    .filter((p) => p.category !== "wildcard" && p.relevance(c) > 0 && p.entry.some((t) => isFillable(t, c)))
    .sort((a, b) => Number(b.critical) - Number(a.critical) || b.relevance(c) - a.relevance(c))
    .slice(0, count)
    .map((p) => ({ id: p.id, question: fillTemplate(p.entry.find((t) => isFillable(t, c))!, c), key: p.critical }));
}
