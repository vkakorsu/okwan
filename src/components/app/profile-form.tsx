"use client";

import { useActionState, useState, type ReactNode } from "react";
import { confirmProfile, type ConfirmState } from "@/app/app/actions";
import { TEST_NAMES } from "@/lib/domain/case";
import { Button, Field, inputCls } from "./ui";

type V = Record<string, unknown>;
const get = (o: V | undefined, path: string): string => {
  const v = path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as V)[k] : undefined), o);
  return v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
};
const arr = (o: V | undefined, path: string): V[] => {
  const v = path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as V)[k] : undefined), o);
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as V[]) : [];
};
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/**
 * A list the applicant can grow and shrink (sponsors, relatives, refusals…).
 * Inputs are named "<name>.<index>.<field>"; the server reads every row
 * (src/app/app/actions.ts, confirmProfile). Rows left empty are dropped there.
 */
function Rows({
  name,
  initial,
  max,
  addLabel,
  startEmpty = false,
  children,
}: {
  name: string;
  initial: V[];
  max: number;
  addLabel: string;
  /** Show no row until the applicant adds one (for things most people don't have). */
  startEmpty?: boolean;
  children: (row: V, field: (f: string) => string) => ReactNode;
}) {
  const [rows, setRows] = useState(() => {
    const start = initial.length ? initial : startEmpty ? [] : [{}];
    return start.map((v, i) => ({ key: i, v }));
  });
  const [next, setNext] = useState(rows.length);
  return (
    <div className="col-span-full grid gap-3">
      {rows.map((row, i) => (
        <div key={row.key} className="grid gap-4 rounded-[3px] border border-line p-3 sm:grid-cols-2">
          {children(row.v, (f) => `${name}.${i}.${f}`)}
          <div className="col-span-full">
            <button
              type="button"
              className="text-xs text-muted underline"
              onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      {rows.length < max && (
        <div>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => {
              setRows((r) => [...r, { key: next, v: {} }]);
              setNext((n) => n + 1);
            }}
          >
            + {addLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export function ProfileForm({
  caseId,
  visaType,
  values,
  fundsHint,
  applicantName,
}: {
  caseId: string;
  visaType: "F1" | "B1B2";
  values: V;
  /** How a statement's cedi balance was converted, for the user to check. */
  fundsHint?: string;
  /** The name the account was set up with, to pre-fill the full name. */
  applicantName?: string;
}) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmProfile.bind(null, caseId), {});
  const v = (p: string) => get(values, p);
  const section = "grid gap-4 sm:grid-cols-2";
  const h = "font-display col-span-full mt-6 text-2xl first:mt-0";
  const sub = "col-span-full -mt-2 text-sm text-muted";
  const f1 = visaType === "F1";

  return (
    <form action={action} className={section}>
      <h2 className={h}>You</h2>
      <p className={sub}>As on your passport and DS-160. The officer may check your name and date of birth at the window.</p>
      <Field label="Full name"><input name="applicant.fullName" defaultValue={v("applicant.fullName") || applicantName} className={inputCls} /></Field>
      <Field label="First name (what you're called)"><input name="applicant.firstName" defaultValue={v("applicant.firstName")} className={inputCls} required /></Field>
      <Field label="Date of birth"><input name="applicant.dateOfBirth" type="date" defaultValue={v("applicant.dateOfBirth")} className={inputCls} /></Field>
      <Field label="Passport expiry date"><input name="applicant.passportExpiry" type="date" defaultValue={v("applicant.passportExpiry")} className={inputCls} /></Field>
      <Field label="Nationality" hint="Leave empty if Ghanaian"><input name="applicant.nationality" defaultValue={v("applicant.nationality")} className={inputCls} /></Field>
      <Field label="Age"><input name="applicant.age" type="number" min={10} max={110} defaultValue={v("applicant.age")} className={inputCls} required /></Field>
      <Field label="Marital status">
        <select name="applicant.maritalStatus" defaultValue={v("applicant.maritalStatus") || "single"} className={inputCls}>
          <option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option>
        </select>
      </Field>
      <Field label="Children"><input name="applicant.children" type="number" min={0} defaultValue={v("applicant.children") || "0"} className={inputCls} /></Field>
      <Field label="City you live in"><input name="applicant.city" defaultValue={v("applicant.city")} className={inputCls} required /></Field>

      {f1 ? (
        <>
          <h2 className={h}>Your studies</h2>
          <Field label="School"><input name="study.school" defaultValue={v("study.school")} className={inputCls} required /></Field>
          <Field label="Program"><input name="study.program" defaultValue={v("study.program")} className={inputCls} required /></Field>
          <Field label="Level">
            <select name="study.level" defaultValue={v("study.level") || "masters"} className={inputCls}>
              <option value="undergraduate">Undergraduate</option><option value="masters">Master&rsquo;s</option><option value="phd">PhD</option><option value="certificate">Certificate</option>
            </select>
          </Field>
          <Field label="Start term"><input name="study.startTerm" defaultValue={v("study.startTerm")} placeholder="Fall 2027" className={inputCls} /></Field>
          <Field label="I-20 first-year cost (USD)"><input name="study.i20Year1CostUsd" type="number" min={0} defaultValue={v("study.i20Year1CostUsd")} className={inputCls} required /></Field>
          <Field label="Scholarship or school funding per year (USD)" hint="As on your I-20. Leave empty if none."><input name="study.scholarshipUsd" type="number" min={0} defaultValue={v("study.scholarshipUsd")} className={inputCls} /></Field>
          <Field label="Schools you applied to"><input name="study.schoolsAppliedTo" type="number" min={1} defaultValue={v("study.schoolsAppliedTo")} className={inputCls} /></Field>
          <Field label="Schools that admitted you"><input name="study.admissionsReceived" type="number" min={0} defaultValue={v("study.admissionsReceived")} className={inputCls} /></Field>
          <Field label="What you do now"><input name="study.currentOccupation" defaultValue={v("study.currentOccupation")} className={inputCls} /></Field>
          <div className="col-span-full">
            <Field label="Your honest plan after graduating" hint="Only used for coaching, in your words. Never shown to the officer as a fact they 'know'.">
              <textarea name="study.postStudyPlan" defaultValue={v("study.postStudyPlan")} rows={2} maxLength={400} className={inputCls} />
            </Field>
          </div>

          <h2 className={h}>Your education so far</h2>
          <p className={sub}>Your last completed school or degree. Officers ask about grades and test scores.</p>
          <Field label="Last school or university"><input name="education.lastSchool" defaultValue={v("education.lastSchool")} className={inputCls} /></Field>
          <Field label="What you studied there"><input name="education.lastProgram" defaultValue={v("education.lastProgram")} className={inputCls} /></Field>
          <Field label="Year you finished"><input name="education.graduationYear" type="number" min={1950} max={2100} defaultValue={v("education.graduationYear")} className={inputCls} /></Field>
          <Field label="Result" hint="As you'd say it: Second Class Upper, 3.4 CGPA, 8 A's"><input name="education.result" defaultValue={v("education.result")} className={inputCls} /></Field>
          <Rows name="tests" initial={arr(values, "education.tests")} max={6} addLabel="Add a test score" startEmpty>
            {(row, n) => (
              <>
                <Field label="Test">
                  <select name={n("name")} defaultValue={s(row.name) || "TOEFL"} className={inputCls}>
                    {TEST_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Score"><input name={n("score")} defaultValue={s(row.score)} placeholder="e.g. 102, 7.5, 1350" className={inputCls} /></Field>
              </>
            )}
          </Rows>
        </>
      ) : (
        <>
          <h2 className={h}>Your trip</h2>
          <div className="col-span-full"><Field label="Purpose"><input name="visit.purpose" defaultValue={v("visit.purpose")} className={inputCls} required /></Field></div>
          <Field label="Event, if any" hint="The graduation, conference or meeting"><input name="visit.event" defaultValue={v("visit.event")} className={inputCls} /></Field>
          <Field label="Arrival date (as on your DS-160)"><input name="visit.arrivalDate" type="date" defaultValue={v("visit.arrivalDate")} className={inputCls} /></Field>
          <Field label="Length of stay (days)"><input name="visit.durationDays" type="number" min={1} max={365} defaultValue={v("visit.durationDays")} className={inputCls} required /></Field>
          <Field label="Estimated trip cost (USD)"><input name="visit.tripCostUsd" type="number" min={0} defaultValue={v("visit.tripCostUsd")} className={inputCls} /></Field>
          <Field label="Who you're visiting"><input name="visit.hostRelationship" defaultValue={v("visit.hostRelationship")} placeholder="daughter" className={inputCls} /></Field>
          <Field label="Their city"><input name="visit.hostCity" defaultValue={v("visit.hostCity")} className={inputCls} /></Field>
          <Field label="Where you'll stay"><input name="visit.stayingAt" defaultValue={v("visit.stayingAt")} placeholder="With my daughter in Houston" className={inputCls} /></Field>
          <Field label="Who's travelling with you"><input name="visit.travellingWith" defaultValue={v("visit.travellingWith")} placeholder="Nobody, or my wife" className={inputCls} /></Field>
        </>
      )}

      <h2 className={h}>Money</h2>
      <p className={sub}>Everyone paying for {f1 ? "your studies" : "the trip"}. Put &ldquo;self&rdquo; if it&rsquo;s you.</p>
      <Rows name="sponsors" initial={arr(values, "funding.sponsors")} max={5} addLabel="Add another sponsor">
        {(row, n) => (
          <>
            <Field label="Sponsor (relationship)" hint="e.g. self, father, uncle, employer"><input name={n("relationship")} defaultValue={s(row.relationship)} className={inputCls} /></Field>
            <Field label="Their name"><input name={n("name")} defaultValue={s(row.name)} className={inputCls} /></Field>
            <Field label="What they do"><input name={n("occupation")} defaultValue={s(row.occupation)} className={inputCls} /></Field>
            <Field label="Employer or business name"><input name={n("employerOrBusiness")} defaultValue={s(row.employerOrBusiness)} className={inputCls} /></Field>
            <Field label="Yearly income (USD)"><input name={n("annualIncomeUsd")} type="number" min={0} defaultValue={s(row.annualIncomeUsd)} className={inputCls} /></Field>
            <Field label="Other people they support" hint="Children in school, relatives"><input name={n("otherDependants")} type="number" min={0} defaultValue={s(row.otherDependants)} className={inputCls} /></Field>
          </>
        )}
      </Rows>
      <Field label="Documented funds available (USD)" hint={fundsHint}><input name="funding.liquidFundsUsd" type="number" min={0} defaultValue={v("funding.liquidFundsUsd")} className={inputCls} required /></Field>
      <Field label="Any large recent deposit (USD)"><input name="funding.recentLargeDepositUsd" type="number" min={0} defaultValue={v("funding.recentLargeDepositUsd")} className={inputCls} /></Field>

      <h2 className={h}>Ties to Ghana</h2>
      <Field label="Employer"><input name="ties.employer" defaultValue={v("ties.employer")} className={inputCls} /></Field>
      <Field label="Role"><input name="ties.role" defaultValue={v("ties.role")} className={inputCls} /></Field>
      <Field label="Years there"><input name="ties.yearsEmployed" type="number" min={0} step="0.5" defaultValue={v("ties.yearsEmployed")} className={inputCls} /></Field>
      <Field label="Monthly income (GH₵)"><input name="ties.monthlyIncomeGhs" type="number" min={0} defaultValue={v("ties.monthlyIncomeGhs")} className={inputCls} /></Field>
      <div className="col-span-full flex flex-col gap-2 text-sm">
        {!f1 && (
          <label className="flex items-center gap-2"><input type="checkbox" name="ties.leaveApproved" defaultChecked={v("ties.leaveApproved") === "true"} /> My employer has approved leave for this trip</label>
        )}
        <label className="flex items-center gap-2"><input type="checkbox" name="ties.ownsBusiness" defaultChecked={v("ties.ownsBusiness") === "true"} /> I own a business</label>
      </div>
      <Field label="Business name"><input name="ties.businessName" defaultValue={v("ties.businessName")} className={inputCls} /></Field>
      <Field label="Years running it"><input name="ties.businessYears" type="number" min={0} step="0.5" defaultValue={v("ties.businessYears")} className={inputCls} /></Field>
      <div className="col-span-full text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="ties.ownsProperty" defaultChecked={v("ties.ownsProperty") === "true"} /> I own property</label>
      </div>
      <div className="col-span-full">
        <Field label="What property" hint="e.g. a 3-bedroom house in Tema, two plots at Kasoa"><input name="ties.propertyDetail" defaultValue={v("ties.propertyDetail")} className={inputCls} /></Field>
      </div>

      <h2 className={h}>Family in Ghana</h2>
      <Field label="Father's occupation"><input name="family.fatherOccupation" defaultValue={v("family.fatherOccupation")} className={inputCls} /></Field>
      <Field label="Mother's occupation"><input name="family.motherOccupation" defaultValue={v("family.motherOccupation")} className={inputCls} /></Field>
      <Field label="Spouse's occupation"><input name="family.spouseOccupation" defaultValue={v("family.spouseOccupation")} className={inputCls} /></Field>
      <Field label="Brothers and sisters"><input name="family.siblings" type="number" min={0} defaultValue={v("family.siblings")} className={inputCls} /></Field>

      <h2 className={h}>History</h2>
      <p className={sub}>Previous trips to the US, as on your DS-160.</p>
      <Rows name="usVisits" initial={arr(values, "history.usVisits")} max={20} addLabel="Add a US trip" startEmpty>
        {(row, n) => (
          <>
            <Field label="Year"><input name={n("year")} type="number" min={1950} max={2100} defaultValue={s(row.year)} className={inputCls} /></Field>
            <Field label="How many days"><input name={n("durationDays")} type="number" min={1} defaultValue={s(row.durationDays)} className={inputCls} /></Field>
            <div className="col-span-full"><Field label="Why you went"><input name={n("purpose")} defaultValue={s(row.purpose)} className={inputCls} /></Field></div>
          </>
        )}
      </Rows>
      <Field label="Previous US visits in total" hint="If you can't list them all above"><input name="history.priorUsVisits" type="number" min={0} defaultValue={v("history.priorUsVisits") || "0"} className={inputCls} /></Field>
      <Field label="Other countries visited" hint="Comma-separated"><input name="history.otherCountriesVisited" defaultValue={v("history.otherCountriesVisited")} className={inputCls} /></Field>
      <p className={sub}>Previous US visa refusals. The officer can see every one.</p>
      <Rows name="refusals" initial={arr(values, "history.priorRefusals")} max={10} addLabel="Add a refusal" startEmpty>
        {(row, n) => (
          <>
            <Field label="Year"><input name={n("year")} type="number" min={1990} max={2100} defaultValue={s(row.year)} className={inputCls} /></Field>
            <Field label="Section">
              <select name={n("section")} defaultValue={s(row.section) || "214b"} className={inputCls}>
                <option value="214b">214(b)</option><option value="221g">221(g)</option><option value="other">Other</option>
              </select>
            </Field>
          </>
        )}
      </Rows>
      <p className={sub}>Relatives in the US, as on your DS-160.</p>
      <Rows name="usContacts" initial={arr(values, "usContacts")} max={10} addLabel="Add a relative in the US" startEmpty>
        {(row, n) => (
          <>
            <Field label="Relationship"><input name={n("relationship")} defaultValue={s(row.relationship)} className={inputCls} /></Field>
            <Field label="Their city"><input name={n("city")} defaultValue={s(row.city)} className={inputCls} /></Field>
            <Field label="Their status">
              <select name={n("status")} defaultValue={s(row.status) || "unknown"} className={inputCls}>
                <option value="unknown">Not sure</option><option value="citizen">US citizen</option><option value="green_card">Green card</option><option value="visa_holder">Visa holder</option>
              </select>
            </Field>
          </>
        )}
      </Rows>

      <div className="col-span-full mt-6 flex flex-wrap items-center gap-4">
        <Button disabled={pending}>{pending ? "Saving…" : "These facts are true. Confirm."}</Button>
        {state.error && <p role="alert" className="text-sm text-refused">{state.error}</p>}
      </div>
    </form>
  );
}
