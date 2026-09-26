import type { VisaType } from "./case";

/**
 * Turns the confirm-your-facts form (src/components/app/profile-form.tsx) into
 * a Case Profile candidate for CaseProfile.parse. Repeatable groups arrive as
 * "<group>.<index>.<field>"; every row is kept, rows missing their key field
 * are dropped, and indexes may have gaps (rows the applicant removed).
 */

type Entries = Iterable<[string, FormDataEntryValue]>;

const str = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : v.trim());
const num = (v: string | undefined) => (str(v) === undefined ? undefined : Number(v));
const list = (v: string | undefined) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Rows of one repeatable group, in index order. */
export function formRows(fields: Map<string, string>, group: string): Record<string, string>[] {
  const rows = new Map<number, Record<string, string>>();
  for (const [key, value] of fields) {
    const m = key.match(/^([A-Za-z]+)\.(\d+)\.([A-Za-z]+)$/);
    if (!m || m[1] !== group) continue;
    const i = Number(m[2]);
    rows.set(i, { ...(rows.get(i) ?? {}), [m[3]]: value });
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

export function profileCandidate(
  entries: Entries,
  opts: { visaType: VisaType; version: number; fallbackFirstName: string },
): Record<string, unknown> {
  const fields = new Map<string, string>();
  for (const [k, v] of entries) if (typeof v === "string") fields.set(k, v);
  const g = (k: string) => fields.get(k);
  const checked = (k: string) => g(k) === "on";

  const sponsors = formRows(fields, "sponsors")
    .filter((r) => str(r.relationship))
    .map((r) => ({
      relationship: str(r.relationship),
      name: str(r.name),
      occupation: str(r.occupation),
      employerOrBusiness: str(r.employerOrBusiness),
      annualIncomeUsd: num(r.annualIncomeUsd),
      otherDependants: num(r.otherDependants),
    }));
  const usVisits = formRows(fields, "usVisits")
    .filter((r) => num(r.year) !== undefined)
    .map((r) => ({ year: num(r.year), durationDays: num(r.durationDays), purpose: str(r.purpose) }));
  const refusals = formRows(fields, "refusals")
    .filter((r) => num(r.year) !== undefined)
    .map((r) => ({ year: num(r.year), section: str(r.section) ?? "214b" }));
  const usContacts = formRows(fields, "usContacts")
    .filter((r) => str(r.relationship))
    .map((r) => ({ relationship: str(r.relationship), city: str(r.city), status: str(r.status) ?? "unknown" }));
  const tests = formRows(fields, "tests")
    .filter((r) => str(r.score))
    .map((r) => ({ name: str(r.name) ?? "Other", score: str(r.score) }));

  const education = {
    lastSchool: str(g("education.lastSchool")),
    lastProgram: str(g("education.lastProgram")),
    graduationYear: num(g("education.graduationYear")),
    result: str(g("education.result")),
    tests,
  };
  const family = {
    spouseOccupation: str(g("family.spouseOccupation")),
    fatherOccupation: str(g("family.fatherOccupation")),
    motherOccupation: str(g("family.motherOccupation")),
    siblings: num(g("family.siblings")),
  };
  const hasAny = (o: Record<string, unknown>) =>
    Object.values(o).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined));

  return {
    version: opts.version,
    visaType: opts.visaType,
    applicant: {
      firstName: str(g("applicant.firstName")) ?? opts.fallbackFirstName,
      fullName: str(g("applicant.fullName")),
      dateOfBirth: str(g("applicant.dateOfBirth")),
      nationality: str(g("applicant.nationality")),
      passportExpiry: str(g("applicant.passportExpiry")),
      age: num(g("applicant.age")),
      maritalStatus: str(g("applicant.maritalStatus")) ?? "single",
      children: num(g("applicant.children")) ?? 0,
      city: str(g("applicant.city")) ?? "",
    },
    study:
      opts.visaType === "F1"
        ? {
            school: str(g("study.school")),
            program: str(g("study.program")),
            level: str(g("study.level")) ?? "masters",
            startTerm: str(g("study.startTerm")) ?? "",
            i20Year1CostUsd: num(g("study.i20Year1CostUsd")),
            scholarshipUsd: num(g("study.scholarshipUsd")),
            currentOccupation: str(g("study.currentOccupation")),
            postStudyPlan: str(g("study.postStudyPlan")),
            schoolsAppliedTo: num(g("study.schoolsAppliedTo")),
            admissionsReceived: num(g("study.admissionsReceived")),
          }
        : undefined,
    education: opts.visaType === "F1" && hasAny(education) ? education : undefined,
    visit:
      opts.visaType === "B1B2"
        ? {
            purpose: str(g("visit.purpose")),
            durationDays: num(g("visit.durationDays")),
            hostRelationship: str(g("visit.hostRelationship")),
            hostCity: str(g("visit.hostCity")),
            arrivalDate: str(g("visit.arrivalDate")),
            stayingAt: str(g("visit.stayingAt")),
            event: str(g("visit.event")),
            travellingWith: str(g("visit.travellingWith")),
            tripCostUsd: num(g("visit.tripCostUsd")),
          }
        : undefined,
    funding: {
      sponsors,
      liquidFundsUsd: num(g("funding.liquidFundsUsd")) ?? 0,
      recentLargeDepositUsd: num(g("funding.recentLargeDepositUsd")),
    },
    ties: {
      employer: str(g("ties.employer")),
      role: str(g("ties.role")),
      yearsEmployed: num(g("ties.yearsEmployed")),
      monthlyIncomeGhs: num(g("ties.monthlyIncomeGhs")),
      // An unticked box isn't "refused leave", only not confirmed.
      leaveApproved: opts.visaType === "B1B2" && checked("ties.leaveApproved") ? true : undefined,
      ownsBusiness: checked("ties.ownsBusiness"),
      businessName: str(g("ties.businessName")),
      businessYears: num(g("ties.businessYears")),
      ownsProperty: checked("ties.ownsProperty"),
      propertyDetail: str(g("ties.propertyDetail")),
    },
    family: hasAny(family) ? family : undefined,
    history: {
      // The count can't be lower than the trips listed.
      priorUsVisits: Math.max(num(g("history.priorUsVisits")) ?? 0, usVisits.length),
      usVisits,
      otherCountriesVisited: list(g("history.otherCountriesVisited")),
      priorRefusals: refusals,
    },
    usContacts,
  };
}
