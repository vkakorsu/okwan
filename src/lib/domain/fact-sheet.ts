import { fundingGapUsd, type CaseProfile } from "./case";

/**
 * "Know your file": the facts on the officer's screen, laid out for revision,
 * plus flashcards for the numbers and dates officers ask about. Facts to know
 * cold, never scripts: the answers stay in the applicant's own words.
 * Everything comes from the confirmed profile and kept notes.
 */

export interface Fact {
  label: string;
  value: string;
  /** A number or date an officer may ask for exactly. */
  key?: boolean;
}
export interface FactSection {
  title: string;
  facts: Fact[];
}
export interface Flashcard {
  question: string;
  answer: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const ghs = (n: number) => `GH₵${Math.round(n).toLocaleString("en-US")}`;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const STATUS: Record<string, string> = { citizen: "US citizen", green_card: "green card holder", visa_holder: "on a visa", unknown: "status not sure" };
const LEVEL: Record<string, string> = { undergraduate: "Undergraduate", masters: "Master's", phd: "PhD", certificate: "Certificate" };

function section(title: string, facts: (Fact | false | undefined | null | "" | 0)[]): FactSection | null {
  const kept = facts.filter((f): f is Fact => Boolean(f));
  return kept.length ? { title, facts: kept } : null;
}

export function factSheet(c: CaseProfile): FactSection[] {
  const a = c.applicant;
  const s = c.study;
  const v = c.visit;
  const e = c.education;
  const t = c.ties;
  const gap = fundingGapUsd(c);
  const sections = [
    section("You", [
      a.fullName && { label: "Full name", value: a.fullName },
      a.dateOfBirth && { label: "Date of birth", value: a.dateOfBirth, key: true },
      a.passportExpiry && { label: "Passport expires", value: a.passportExpiry, key: true },
      { label: "Age", value: String(a.age) },
      a.nationality && { label: "Nationality", value: a.nationality },
      { label: "Marital status", value: cap(a.maritalStatus) },
      { label: "Children", value: String(a.children) },
      a.city && { label: "City", value: a.city },
    ]),
    s &&
      section("Your studies", [
        { label: "School", value: s.school },
        { label: "Program", value: `${s.program} (${LEVEL[s.level] ?? s.level})` },
        s.startTerm && { label: "Starts", value: s.startTerm, key: true },
        s.schoolsAppliedTo !== undefined && { label: "Schools applied to", value: String(s.schoolsAppliedTo), key: true },
        s.admissionsReceived !== undefined && { label: "Schools that admitted you", value: String(s.admissionsReceived), key: true },
        s.currentOccupation && { label: "What you do now", value: s.currentOccupation },
      ]),
    e &&
      section("Your education so far", [
        (e.lastProgram || e.lastSchool) && { label: "Last studies", value: [e.lastProgram, e.lastSchool].filter(Boolean).join(", ") },
        e.graduationYear && { label: "Finished", value: String(e.graduationYear), key: true },
        e.result && { label: "Result", value: e.result, key: true },
        ...(e.tests ?? []).map((x) => ({ label: x.name, value: x.score, key: true })),
      ]),
    v &&
      section("Your trip", [
        { label: "Purpose", value: v.purpose },
        v.event && { label: "Event", value: v.event },
        v.arrivalDate && { label: "Arriving", value: v.arrivalDate, key: true },
        { label: "Length of stay", value: `${v.durationDays} days`, key: true },
        v.hostRelationship && { label: "Visiting", value: `${cap(v.hostRelationship)}${v.hostCity ? ` in ${v.hostCity}` : ""}` },
        v.stayingAt && { label: "Staying at", value: v.stayingAt },
        v.travellingWith && { label: "Travelling with", value: v.travellingWith },
        v.tripCostUsd !== undefined && { label: "Trip cost", value: usd(v.tripCostUsd), key: true },
      ]),
    section("Money", [
      s && { label: "I-20 first-year cost", value: usd(s.i20Year1CostUsd), key: true },
      s?.scholarshipUsd && { label: "Scholarship or school funding", value: `${usd(s.scholarshipUsd)} a year`, key: true },
      { label: "Documented funds", value: usd(c.funding.liquidFundsUsd), key: true },
      c.funding.recentLargeDepositUsd && { label: "Recent large deposit", value: usd(c.funding.recentLargeDepositUsd), key: true },
      gap > 0 && { label: "Still to show for year one", value: usd(gap), key: true },
      ...c.funding.sponsors.map((sp, i) => ({
        label: c.funding.sponsors.length > 1 ? `Sponsor ${i + 1}` : "Sponsor",
        value: [
          cap(sp.relationship) + (sp.name ? ` (${sp.name})` : ""),
          sp.occupation,
          sp.employerOrBusiness && `at ${sp.employerOrBusiness}`,
          sp.annualIncomeUsd !== undefined && `about ${usd(sp.annualIncomeUsd)} a year`,
          sp.otherDependants !== undefined && `also supports ${sp.otherDependants}`,
        ]
          .filter(Boolean)
          .join(", "),
        key: sp.annualIncomeUsd !== undefined,
      })),
    ]),
    section("Work and ties to Ghana", [
      t.employer && { label: "Employer", value: `${t.employer}${t.role ? `, ${t.role}` : ""}` },
      t.yearsEmployed !== undefined && { label: "Years there", value: String(t.yearsEmployed), key: true },
      t.monthlyIncomeGhs !== undefined && { label: "Monthly income", value: ghs(t.monthlyIncomeGhs), key: true },
      t.leaveApproved && { label: "Leave", value: "Approved by your employer" },
      t.ownsBusiness && { label: "Business", value: `${t.businessName ?? "Yes"}${t.businessYears !== undefined ? `, ${t.businessYears} years` : ""}` },
      t.ownsProperty && { label: "Property", value: t.propertyDetail ?? "Yes" },
    ]),
    c.family &&
      section("Family in Ghana", [
        c.family.fatherOccupation && { label: "Father", value: c.family.fatherOccupation },
        c.family.motherOccupation && { label: "Mother", value: c.family.motherOccupation },
        c.family.spouseOccupation && { label: "Spouse", value: c.family.spouseOccupation },
        c.family.siblings !== undefined && { label: "Brothers and sisters", value: String(c.family.siblings), key: true },
      ]),
    section("Travel and history", [
      { label: "Previous US visits", value: String(c.history.priorUsVisits), key: true },
      ...c.history.usVisits.map((u) => ({
        label: `US trip ${u.year}`,
        value: [u.durationDays && `${u.durationDays} days`, u.purpose].filter(Boolean).join(", ") || "Yes",
        key: true,
      })),
      { label: "Other countries", value: c.history.otherCountriesVisited.join(", ") || "None" },
      ...c.history.priorRefusals.map((r) => ({ label: `Refused ${r.year}`, value: r.section === "214b" ? "214(b)" : r.section === "221g" ? "221(g)" : "Other", key: true })),
    ]),
    section(
      "People in the US",
      c.usContacts.length
        ? c.usContacts.map((u) => ({ label: cap(u.relationship), value: `${u.city ?? "city not given"}, ${STATUS[u.status] ?? u.status}` }))
        : [{ label: "Relatives in the US", value: "None on your form" }],
    ),
  ];
  return sections.filter((x): x is FactSection => Boolean(x));
}

/** Questions officers ask for exactly, with the answer from the file. */
export function flashcards(c: CaseProfile): Flashcard[] {
  const cards: (Flashcard | false | undefined | null | "" | 0)[] = [
    c.study && { question: "What's the total cost of your first year?", answer: usd(c.study.i20Year1CostUsd) },
    c.study?.scholarshipUsd && { question: "How much is your scholarship?", answer: `${usd(c.study.scholarshipUsd)} a year` },
    { question: "How much money do you have available?", answer: usd(c.funding.liquidFundsUsd) },
    fundingGapUsd(c) > 0 && { question: "How much are you short for the first year, and where does it come from?", answer: `${usd(fundingGapUsd(c))}. Know exactly who covers it.` },
    c.funding.sponsors[0] && { question: "Who is sponsoring you?", answer: cap(c.funding.sponsors[0].relationship) + (c.funding.sponsors[0].name ? ` (${c.funding.sponsors[0].name})` : "") },
    c.funding.sponsors[0]?.occupation && { question: "What does your sponsor do?", answer: c.funding.sponsors[0].occupation },
    c.funding.sponsors[0]?.annualIncomeUsd !== undefined && { question: "How much does your sponsor earn a year?", answer: `About ${usd(c.funding.sponsors[0].annualIncomeUsd!)}` },
    c.funding.sponsors[0]?.otherDependants !== undefined && { question: "Who else is your sponsor paying for?", answer: `${c.funding.sponsors[0].otherDependants} other people` },
    c.study && { question: "Which school, and which program?", answer: `${c.study.school}, ${c.study.program}` },
    c.study?.startTerm && { question: "When does your program start?", answer: c.study.startTerm },
    c.study?.schoolsAppliedTo !== undefined && { question: "How many schools did you apply to?", answer: String(c.study.schoolsAppliedTo) },
    c.study?.admissionsReceived !== undefined && { question: "How many admitted you?", answer: String(c.study.admissionsReceived) },
    c.education?.graduationYear && { question: "When did you finish your last studies?", answer: String(c.education.graduationYear) },
    c.education?.result && { question: "What did you finish with?", answer: c.education.result },
    ...(c.education?.tests ?? []).map((x) => ({ question: `What did you get on the ${x.name}?`, answer: x.score })),
    c.visit && { question: "How long will you stay?", answer: `${c.visit.durationDays} days${c.visit.arrivalDate ? `, arriving ${c.visit.arrivalDate}` : ""}` },
    c.visit?.stayingAt && { question: "Where will you stay?", answer: c.visit.stayingAt },
    c.visit?.tripCostUsd !== undefined && { question: "How much will the trip cost?", answer: usd(c.visit.tripCostUsd!) },
    c.ties.employer && { question: "Where do you work, and for how long?", answer: `${c.ties.employer}${c.ties.yearsEmployed !== undefined ? `, ${c.ties.yearsEmployed} years` : ""}` },
    c.ties.monthlyIncomeGhs !== undefined && { question: "How much do you earn a month?", answer: ghs(c.ties.monthlyIncomeGhs!) },
    { question: "Have you been to the US before?", answer: c.history.priorUsVisits ? `Yes, ${c.history.priorUsVisits} time(s)` : "No" },
    { question: "Have you ever been refused a US visa?", answer: c.history.priorRefusals.length ? `Yes: ${c.history.priorRefusals.map((r) => r.year).join(", ")}` : "No" },
    { question: "Do you have family in the US?", answer: c.usContacts.length ? c.usContacts.map((u) => u.relationship).join(", ") : "None on your form" },
  ];
  return cards.filter((x): x is Flashcard => Boolean(x));
}
