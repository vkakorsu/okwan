import { z } from "zod";
import { similarity } from "./similarity";

/**
 * Case notes: facts specific to one applicant that don't fit the structured
 * profile ("GH₵270,000 deposited three weeks before the interview", "father's
 * business registered in 2021"). Each quotes its document, and only notes the
 * user confirmed are used (docs/INTERVIEW-REALISM.md §6).
 */

export const NOTE_CATEGORIES = ["funding", "ties", "study", "employment", "family", "travel", "history", "visit", "other"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const ExtractedNote = z.object({
  category: z.enum(NOTE_CATEGORIES),
  text: z.string().min(1).max(300),
  quote: z.string().max(300).optional(),
});
export type ExtractedNote = z.infer<typeof ExtractedNote>;

export interface CaseNote {
  id: string;
  sourceKind: string;
  category: NoteCategory;
  text: string;
}

/**
 * What an Accra officer has on screen: the DS-160, the SEVIS/I-20 record, the
 * passport and any prior refusal. Everything else stays in the applicant's
 * folder until the officer asks for it.
 */
const ON_SCREEN_KINDS = new Set(["ds160", "i20", "ds2019", "passport_bio", "passport_travel_page", "refusal_letter", "appointment_confirmation"]);
export const isOnScreen = (sourceKind: string) => ON_SCREEN_KINDS.has(sourceKind);

export const DOCUMENT_LABEL: Record<string, string> = {
  ds160: "DS-160",
  i20: "I-20",
  ds2019: "DS-2019",
  admission_letter: "admission letter",
  scholarship_letter: "scholarship letter",
  academic_record: "transcript",
  bank_statement: "bank statement",
  sponsor_letter: "sponsor letter",
  employment_letter: "employment letter",
  business_registration: "business registration",
  property: "property document",
  invitation_letter: "invitation letter",
  refusal_letter: "refusal letter",
  appointment_confirmation: "appointment confirmation",
  passport_bio: "passport",
  passport_travel_page: "passport stamps",
  other: "other document",
};
export const documentLabel = (kind: string) => DOCUMENT_LABEL[kind] ?? kind.replaceAll("_", " ");

/** Matches what the officer asked for ("bank statements", "your sponsor's letter") to a document kind. */
export function matchDocumentKind(requested: string, available: readonly string[]): string | null {
  const q = requested.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  const direct = available.find((k) => q.includes(k.replaceAll("_", " ")) || q.includes(documentLabel(k).toLowerCase()));
  if (direct) return direct;
  const words: Record<string, string[]> = {
    bank_statement: ["bank", "statement", "account", "funds"],
    sponsor_letter: ["sponsor", "affidavit", "support"],
    employment_letter: ["employment", "employer", "job", "work", "leave", "payslip"],
    business_registration: ["business", "company", "registration"],
    property: ["property", "land", "house", "deed"],
    invitation_letter: ["invitation", "invite"],
    scholarship_letter: ["scholarship", "financial aid", "award", "grant", "assistantship", "bursary"],
    admission_letter: ["admission", "offer", "acceptance"],
    academic_record: ["transcript", "result", "grade", "certificate", "toefl", "ielts", "gmat", "wassce", "test score"],
    i20: ["i 20", "i20"],
    ds160: ["ds 160", "ds160", "application"],
  };
  for (const k of available) if (words[k]?.some((w) => q.includes(w))) return k;
  return null;
}

/**
 * Reduces ID, passport, card and account numbers to their last 4 digits.
 * Amounts (with separators or decimals) and dates are left alone.
 */
export function redactIdentifiers(text: string): string {
  return (
    text
      // Ghana Card: GHA-123456789-0
      .replace(/\bGHA-?\d{6,9}-?\d\b/gi, (m) => `GHA-••••${m.replace(/\D/g, "").slice(-4)}`)
      // Passport-style: G1234567, AB1234567
      .replace(/\b[A-Z]{1,2}\d{6,8}\b/g, (m) => `••••${m.slice(-4)}`)
      // Card numbers written in groups of four
      .replace(/\b\d{4}(?: \d{4}){2,3}\b/g, (m) => `••••${m.slice(-4)}`)
      // Account and phone numbers: unbroken runs of 9+ digits. Amounts in a
      // statement table are separated by spaces, so they're never joined.
      .replace(/\b\d{9,}\b/g, (m) => `••••${m.slice(-4)}`)
  );
}

/** Converts an amount in a stated currency to USD. Unknown currencies return undefined. */
export function toUsd(amount: number, currency: string, ghsPerUsd: number): number | undefined {
  const c = currency.trim().toUpperCase();
  if (["USD", "US$", "$"].includes(c)) return Math.round(amount);
  if (["GHS", "GH₵", "GHC", "CEDI", "CEDIS", "₵"].includes(c)) return Math.round(amount / ghsPerUsd);
  return undefined;
}

/** Amounts in a sentence (years and small numbers left out). */
function amounts(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((m) => Number(m[0].replace(/,/g, "")))
    .filter((n) => n >= 100 && !(n >= 1900 && n <= 2100 && Number.isInteger(n)));
}

/**
 * Whether two notes state the same fact: close wording, or the same amount
 * (the I-20 and the admission letter describe one scholarship differently).
 */
export function isDuplicateNote(a: string, b: string): boolean {
  if (similarity(a, b) >= 0.5) return true;
  const x = amounts(a);
  return x.length > 0 && amounts(b).some((n) => x.includes(n));
}
