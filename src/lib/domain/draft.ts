import { z } from "zod";
import { PriorRefusal, Sponsor, TestScore, UsContact, UsVisit, VisaType } from "./case";
import { ExtractedNote } from "./notes";

const Money = z.object({ amount: z.number(), currency: z.string().max(8) });

/**
 * What extraction may produce from one document: every field optional. The
 * draft is shown to the user to confirm; nothing here reaches the officer
 * until it's confirmed into a CaseProfile.
 */
export const ExtractedFacts = z.object({
  documentLooksLike: z.string().max(80).optional(),
  /** How well the scan or photo could be read. */
  legibility: z.enum(["clear", "partly_unreadable", "unreadable"]).optional(),
  /** What couldn't be read, in plain words ("the balance column on page 2 is blurred"). */
  unreadable: z.string().max(200).optional(),
  visaType: VisaType.optional(),
  applicant: z
    .object({
      firstName: z.string().max(60),
      fullName: z.string().max(120),
      dateOfBirth: z.string().max(10),
      nationality: z.string().max(60),
      passportExpiry: z.string().max(10),
      age: z.number().int(),
      maritalStatus: z.enum(["single", "married", "divorced", "widowed"]),
      children: z.number().int(),
      city: z.string().max(80),
    })
    .partial()
    .optional(),
  study: z
    .object({
      school: z.string().max(160),
      program: z.string().max(160),
      level: z.enum(["undergraduate", "masters", "phd", "certificate"]),
      startTerm: z.string().max(40),
      i20Year1CostUsd: z.number(),
      scholarshipUsd: z.number(),
      currentOccupation: z.string().max(160),
      schoolsAppliedTo: z.number().int(),
      admissionsReceived: z.number().int(),
    })
    .partial()
    .optional(),
  education: z
    .object({
      lastSchool: z.string().max(160),
      lastProgram: z.string().max(160),
      graduationYear: z.number().int(),
      result: z.string().max(80),
      tests: z.array(TestScore).max(6),
    })
    .partial()
    .optional(),
  visit: z
    .object({
      purpose: z.string().max(200),
      durationDays: z.number().int(),
      hostRelationship: z.string().max(60),
      hostCity: z.string().max(80),
      arrivalDate: z.string().max(10),
      stayingAt: z.string().max(160),
      event: z.string().max(160),
      travellingWith: z.string().max(120),
      tripCostUsd: z.number(),
    })
    .partial()
    .optional(),
  funding: z
    .object({
      sponsors: z.array(Sponsor).max(5),
      liquidFundsUsd: z.number(),
      recentLargeDepositUsd: z.number(),
      /** As printed (e.g. GHS). Converted to USD on the server, for the user to confirm. */
      fundsAvailable: Money,
      recentLargeDeposit: Money.extend({ date: z.string().max(40).optional() }),
    })
    .partial()
    .optional(),
  ties: z
    .object({
      employer: z.string().max(160),
      role: z.string().max(120),
      yearsEmployed: z.number(),
      monthlyIncomeGhs: z.number(),
      leaveApproved: z.boolean(),
      ownsBusiness: z.boolean(),
      businessName: z.string().max(160),
      businessYears: z.number(),
      ownsProperty: z.boolean(),
      propertyDetail: z.string().max(160),
    })
    .partial()
    .optional(),
  family: z
    .object({
      spouseOccupation: z.string().max(120),
      fatherOccupation: z.string().max(120),
      motherOccupation: z.string().max(120),
      siblings: z.number().int(),
    })
    .partial()
    .optional(),
  history: z
    .object({
      priorUsVisits: z.number().int(),
      usVisits: z.array(UsVisit).max(20),
      otherCountriesVisited: z.array(z.string().max(60)).max(40),
      priorRefusals: z.array(PriorRefusal).max(10),
    })
    .partial()
    .optional(),
  usContacts: z.array(UsContact).max(10).optional(),
  appointment: z.object({ date: z.string().max(40), post: z.string().max(60) }).partial().optional(),
  /** Passport bio page: the last 4 characters of the passport number, never more. */
  passportLast4: z.string().max(4).optional(),
  /** DS-160: the full answers, or only the one-page confirmation (which holds almost nothing). */
  ds160Part: z.enum(["full_answers", "confirmation_page"]).optional(),
  /** Facts specific to this applicant that the fields above can't hold. */
  notes: z.array(ExtractedNote).max(8).optional(),
});
export type ExtractedFacts = z.infer<typeof ExtractedFacts>;

export interface DraftConflict {
  path: string;
  existing: unknown;
  incoming: unknown;
  source: string;
  /** The document that raised it, so reading that document again replaces it. */
  documentId?: string;
}

const norm = (v: unknown) =>
  String(v)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Whether two values say the same thing. Case, punctuation and spacing don't
 * count ("HO" = "Ho"), nor does one being a fuller form of the other
 * ("Vincent" / "Vincent Kofi", "Computer Science" / "Computer Science, General").
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= Math.max(1, 0.005 * Math.max(a, b));
  if (typeof a !== "string" || typeof b !== "string") return JSON.stringify(a) === JSON.stringify(b);
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && ` ${long} `.includes(` ${short} `);
}

/** Drops repeats of the same disagreement. */
export function dedupeConflicts(conflicts: DraftConflict[]): DraftConflict[] {
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const key = [c.path, norm(c.existing), norm(c.incoming)].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Fill gaps from a new document; record disagreements instead of overwriting. */
export function mergeDraft(existing: Obj, incoming: Obj, source: string, path = ""): { merged: Obj; conflicts: DraftConflict[] } {
  const merged: Obj = { ...existing };
  const conflicts: DraftConflict[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null || value === "" || key === "_conflicts") continue;
    const here = path ? `${path}.${key}` : key;
    const current = merged[key];
    if (current === undefined || current === null || current === "") merged[key] = value;
    else if (isObj(current) && isObj(value)) {
      const r = mergeDraft(current, value, source, here);
      merged[key] = r.merged;
      conflicts.push(...r.conflicts);
    } else if (Array.isArray(current) && Array.isArray(value)) {
      const seen = new Set(current.map((v) => JSON.stringify(v)));
      merged[key] = [...current, ...value.filter((v) => !seen.has(JSON.stringify(v)))];
    } else if (!sameValue(current, value)) {
      conflicts.push({ path: here, existing: current, incoming: value, source });
    }
  }
  return { merged, conflicts };
}
