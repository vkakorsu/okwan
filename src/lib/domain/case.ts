import { z } from "zod";

/**
 * The confirmed Case Profile: the single source of truth that the Director,
 * the Officer and every coaching rewrite may use. Fields are only ever
 * filled from user-confirmed extraction, never from raw document text.
 */

export const VisaType = z.enum(["F1", "B1B2"]);
export type VisaType = z.infer<typeof VisaType>;

const Usd = z.number().nonnegative();

export const Sponsor = z.object({
  relationship: z.string().min(1).max(60),
  name: z.string().max(80).optional(),
  occupation: z.string().max(120).optional(),
  /** Where they work, or the name of their business. */
  employerOrBusiness: z.string().max(160).optional(),
  annualIncomeUsd: Usd.optional(),
  /** Other people this sponsor also supports (children in school, relatives). */
  otherDependants: z.number().int().min(0).max(30).optional(),
});

export const UsContact = z.object({
  relationship: z.string().min(1).max(60),
  city: z.string().max(80).optional(),
  status: z.enum(["citizen", "green_card", "visa_holder", "unknown"]).default("unknown"),
});

export const PriorRefusal = z.object({
  year: z.number().int().min(1990).max(2100),
  section: z.enum(["214b", "221g", "other"]),
});

/** One earlier trip to the US, as listed on the DS-160 ("date arrived, length of stay"). */
export const UsVisit = z.object({
  year: z.number().int().min(1950).max(2100),
  durationDays: z.number().int().positive().max(3650).optional(),
  purpose: z.string().max(120).optional(),
});

export const TEST_NAMES = ["TOEFL", "IELTS", "Duolingo", "SAT", "GRE", "GMAT", "WASSCE", "Other"] as const;
export const TestScore = z.object({
  name: z.enum(TEST_NAMES),
  score: z.string().min(1).max(40),
});

export const CaseProfile = z.object({
  version: z.number().int().positive(),
  visaType: VisaType,
  applicant: z.object({
    firstName: z.string().min(1).max(60),
    /** As on the passport; the officer may confirm it at the window. */
    fullName: z.string().max(120).optional(),
    /** YYYY-MM-DD, as on the passport. */
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Empty means Ghanaian. Others applying in Accra must show they live in Ghana. */
    nationality: z.string().max(60).optional(),
    /** YYYY-MM-DD, from the passport bio page. */
    passportExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    age: z.number().int().min(10).max(110),
    maritalStatus: z.enum(["single", "married", "divorced", "widowed"]),
    children: z.number().int().min(0).max(20).default(0),
    city: z.string().max(80),
  }),
  study: z
    .object({
      school: z.string().min(1).max(160),
      program: z.string().min(1).max(160),
      level: z.enum(["undergraduate", "masters", "phd", "certificate"]),
      startTerm: z.string().max(40),
      i20Year1CostUsd: Usd,
      /** Scholarship or other school funding per year (the I-20's "funds from this school"). */
      scholarshipUsd: Usd.optional(),
      currentOccupation: z.string().max(160).optional(),
      postStudyPlan: z.string().max(400).optional(),
      schoolsAppliedTo: z.number().int().min(1).max(60).optional(),
      admissionsReceived: z.number().int().min(0).max(60).optional(),
    })
    .optional(),
  /** Previous education and tests, as on the DS-160 and transcripts. */
  education: z
    .object({
      lastSchool: z.string().max(160).optional(),
      lastProgram: z.string().max(160).optional(),
      graduationYear: z.number().int().min(1950).max(2100).optional(),
      /** As the applicant would say it: "Second Class Upper", "3.4 CGPA", "8 A's in WASSCE". */
      result: z.string().max(80).optional(),
      tests: z.array(TestScore).max(6).default([]),
    })
    .optional(),
  visit: z
    .object({
      purpose: z.string().min(1).max(200),
      durationDays: z.number().int().positive().max(365),
      hostRelationship: z.string().max(60).optional(),
      hostCity: z.string().max(80).optional(),
      /** YYYY-MM-DD, the intended arrival on the DS-160. */
      arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      /** Where they'll stay: "with my daughter in Houston", "Hilton, Atlanta". */
      stayingAt: z.string().max(160).optional(),
      /** The conference, graduation, meeting or event, if there is one. */
      event: z.string().max(160).optional(),
      travellingWith: z.string().max(120).optional(),
      tripCostUsd: Usd.optional(),
    })
    .optional(),
  funding: z.object({
    sponsors: z.array(Sponsor).max(5),
    liquidFundsUsd: Usd,
    recentLargeDepositUsd: Usd.optional(),
  }),
  ties: z.object({
    employer: z.string().max(160).optional(),
    role: z.string().max(120).optional(),
    yearsEmployed: z.number().min(0).max(60).optional(),
    /** Take-home pay a month, in cedis, as the applicant would state it. */
    monthlyIncomeGhs: z.number().nonnegative().optional(),
    /** Visitors: the employer has approved leave for the trip. */
    leaveApproved: z.boolean().optional(),
    ownsBusiness: z.boolean().default(false),
    businessName: z.string().max(160).optional(),
    businessYears: z.number().min(0).max(80).optional(),
    ownsProperty: z.boolean().default(false),
    /** What the property is: "a 3-bedroom house in Tema", "two plots at Kasoa". */
    propertyDetail: z.string().max(160).optional(),
  }),
  /** Immediate family in Ghana, as on the DS-160. */
  family: z
    .object({
      spouseOccupation: z.string().max(120).optional(),
      fatherOccupation: z.string().max(120).optional(),
      motherOccupation: z.string().max(120).optional(),
      siblings: z.number().int().min(0).max(30).optional(),
    })
    .optional(),
  history: z.object({
    priorUsVisits: z.number().int().min(0).default(0),
    /** The trips behind priorUsVisits, when known. */
    usVisits: z.array(UsVisit).max(20).default([]),
    otherCountriesVisited: z.array(z.string().max(60)).max(40).default([]),
    priorRefusals: z.array(PriorRefusal).max(10).default([]),
  }),
  usContacts: z.array(UsContact).max(10).default([]),
});

export type CaseProfile = z.infer<typeof CaseProfile>;

/** What the applicant still has to show for year one after school funding. 0 when covered. */
export function fundingGapUsd(c: CaseProfile): number {
  if (!c.study) return 0;
  return Math.max(0, c.study.i20Year1CostUsd - (c.study.scholarshipUsd ?? 0) - c.funding.liquidFundsUsd);
}
