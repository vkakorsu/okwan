import { notFound } from "next/navigation";
import { deleteUser, exportUser, grantPass, retryJob, setRole, viewCaseFacts, viewSession } from "@/app/admin/actions";
import { PageHead, Section, Table } from "@/components/admin/stat";
import { inputCls } from "@/components/app/ui";
import { openStoryChanges } from "@/lib/domain/director";
import { progress } from "@/lib/domain/progress";
import { LEVEL_LABELS, readiness, readinessTopics } from "@/lib/domain/readiness";
import { CLAIM_LABELS } from "@/lib/domain/story";
import { documentLabel } from "@/lib/domain/notes";
import { ghs, recentlyAudited, requireAdmin } from "@/lib/server/admin";
import { EVENT_NAMES } from "@/lib/server/events";
import { caseCredits, latestProfile, pastSessions } from "@/lib/server/repo";
import { capitalize, DEBRIEF_STATUS_LABELS, formatDate, formatDateTime, modeLabel, outcomeLabel, packLabel } from "@/lib/labels";

export const metadata = { title: "User" };

const NOTICES: Record<string, string> = {
  granted: "Pack granted.",
  "role-updated": "Role updated.",
  "self-demote": "You can't remove your own admin role.",
  retrying: "Running it again. Refresh in a minute.",
  "export-ready": "Logged. The download link below works for 10 minutes.",
  "cant-delete-admin": "Admins can't be deleted here. Change their role first.",
  "confirm-mismatch": "The email you typed doesn't match this account, so nothing was deleted.",
};

function ReasonForm({ action, label, children, danger }: { action: (f: FormData) => Promise<void>; label: string; children?: React.ReactNode; danger?: boolean }) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {children}
      <input name="reason" required minLength={5} maxLength={500} placeholder="Reason (logged)" className={`${inputCls} max-w-xs py-1.5 text-sm`} />
      <button className={`rounded-[3px] border px-3 py-1.5 text-sm ${danger ? "border-refused text-refused hover:bg-refused hover:text-on-ink" : "border-line hover:border-fg/40"}`}>
        {label}
      </button>
    </form>
  );
}

export default async function AdminUser(props: PageProps<"/admin/users/[id]">) {
  const { admin, db } = await requireAdmin();
  const { id } = await props.params;
  const { facts, notice } = await props.searchParams;

  const [{ data: profile }, { data: authUser }, { data: cases }, { data: events }] = await Promise.all([
    db.from("profiles").select("*").eq("id", id).maybeSingle(),
    db.auth.admin.getUserById(id),
    db
      .from("cases")
      .select("id, visa_type, applicant_name, interview_at, identity_locked_at, created_at, passes(*), outcomes(result, reported_at)")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    db.from("events").select("name").eq("user_id", id).limit(5000),
  ]);
  if (!profile) notFound();
  const exportReady = await recentlyAudited(db, admin.id, "export_user", id);
  const usage = new Map<string, number>();
  for (const e of events ?? []) usage.set(e.name, (usage.get(e.name) ?? 0) + 1);

  // Facts are shown only when this admin logged a reason for this case in the last 10 minutes.
  let factsCase: { id: string; profile: unknown } | null = null;
  if (typeof facts === "string" && (await recentlyAudited(db, admin.id, "view_case_facts", facts))) {
    const { data: p } = await db.from("case_profiles").select("profile").eq("case_id", facts).order("version", { ascending: false }).limit(1).maybeSingle();
    factsCase = { id: facts, profile: p?.profile ?? null };
  }

  const applicants = await Promise.all(
    (cases ?? []).map(async (c) => {
      const [current, history, credits, { data: docs }, { data: sessionRows }] = await Promise.all([
        latestProfile(db, c.id),
        pastSessions(db, c.id),
        caseCredits(db, c.id),
        db.from("documents").select("id, kind, extraction_status, extraction_error, extraction, created_at").eq("case_id", c.id).order("created_at", { ascending: false }),
        db
          .from("sessions")
          .select("id, mode, outcome, is_free, created_at, started_at, ended_at, debrief_status, tokens_issued, plan")
          .eq("case_id", c.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      const topics = current ? readinessTopics(current.profile) : [];
      const after = new Map(progress(history, topics, { columns: 1 }).points.map((p) => [p.sessionId, p.score]));
      return { c, current, history, credits, docs: docs ?? [], sessions: sessionRows ?? [], ready: readiness(history, topics), after };
    }),
  );
  const back = `/admin/users/${id}`;

  return (
    <>
      {typeof notice === "string" && NOTICES[notice] && (
        <p role="status" className="mb-6 rounded-[4px] border border-stamp bg-stamp/10 px-4 py-3 text-sm">{NOTICES[notice]}</p>
      )}
      <PageHead title={profile.email ?? authUser.user?.email ?? "User"}>
        Joined {formatDate(profile.created_at)} · Role: <strong>{capitalize(profile.role)}</strong> · Email{" "}
        {authUser.user?.email_confirmed_at ? "confirmed" : <strong>not confirmed</strong>} · Last sign-in:{" "}
        {authUser.user?.last_sign_in_at ? formatDateTime(authUser.user.last_sign_in_at) : "never"}
      </PageHead>

      <Section title="Role">
        <ReasonForm action={setRole.bind(null, id)} label="Set role">
          <select name="role" defaultValue={profile.role} className={`${inputCls} w-auto py-1.5 text-sm`}>
            <option value="applicant">applicant</option>
            <option value="coach">coach</option>
            <option value="senior">senior</option>
            <option value="admin">admin</option>
          </select>
        </ReasonForm>
      </Section>

      {applicants.length === 0 && <p className="mt-8 text-sm text-muted">Hasn&rsquo;t set up their applicant yet.</p>}

      {applicants.map(({ c, current, history, credits, docs, sessions, ready, after }) => {
        const passes = (c.passes ?? []) as {
          id: string;
          plan: string;
          amount_pesewas: number;
          paystack_reference: string;
          purchased_at: string;
          expires_at: string;
          interviews: number;
          drills: number;
        }[];
        const outcome = (c.outcomes as unknown as { result: string } | null)?.result;
        const changes = openStoryChanges(history);
        return (
          <div key={c.id}>
            <Section title={`${c.applicant_name} · ${c.visa_type === "F1" ? "F-1" : "B1/B2"}`}>
              <p className="text-sm text-muted">
                Interview {c.interview_at ? formatDate(c.interview_at) : "not set"} · Readiness{" "}
                <strong className="text-fg">
                  {Math.round(ready.score * 100)}% ({LEVEL_LABELS[ready.level]})
                </strong>{" "}
                · Credits left: {credits.interviews} interviews, {credits.drills} drills · Facts {current ? `confirmed (v${current.version})` : "not confirmed"} ·
                Identity {c.identity_locked_at ? "locked" : "not locked"}
                {outcome ? ` · Reported result: ${outcomeLabel(outcome)}` : ""}
              </p>
              {changes.length > 0 && (
                <p className="mt-2 text-sm text-refused">
                  Story changed: {changes.map((ch) => `${CLAIM_LABELS[ch.key]} ("${ch.before.value}" → "${ch.after.value}")`).join("; ")}
                </p>
              )}
            </Section>

            <Section title="Sessions" note="Opening a session shows the transcript, answers and grades; your reason is logged.">
              <Table
                head={["Started", "Mode", "Officer", "Outcome", "Debrief", "Readiness after", "Connections", ""]}
                rows={sessions.map((s) => {
                  const officer = (s.plan as { officer?: { name: string; traits: { scepticism: number } } }).officer;
                  const started = Boolean(s.started_at);
                  return [
                    started ? formatDateTime(s.started_at!) : <span key="n" className="text-muted">Not started</span>,
                    modeLabel(s.mode, s.is_free),
                    officer ? `${officer.name}${officer.traits.scepticism >= 0.6 ? " (tough)" : ""}` : "—",
                    s.outcome ? outcomeLabel(s.outcome) : "—",
                    started ? (
                      s.debrief_status === "failed" ? (
                        <form key="r" action={retryJob.bind(null, "debrief", s.id, back)}>
                          <button className="text-refused underline underline-offset-2">Failed: retry</button>
                        </form>
                      ) : (
                        DEBRIEF_STATUS_LABELS[s.debrief_status] ?? s.debrief_status
                      )
                    ) : (
                      "—"
                    ),
                    after.has(s.id) ? `${Math.round(after.get(s.id)! * 100)}%` : "—",
                    s.tokens_issued ?? 0,
                    started ? <ReasonForm key="v" action={viewSession.bind(null, id, s.id)} label="Open" /> : "",
                  ];
                })}
                sortValues={sessions.map((s) => [
                  s.started_at ?? null,
                  s.mode,
                  (s.plan as { officer?: { name: string } }).officer?.name ?? null,
                  s.outcome ?? null,
                  s.debrief_status,
                  after.get(s.id) ?? null,
                  s.tokens_issued ?? 0,
                  null,
                ])}
                empty="No sessions yet."
              />
            </Section>

            <Section title="Documents">
              <Table
                head={["Uploaded", "Type", "Status", "Reading", ""]}
                rows={docs.map((d) => {
                  const x = (d.extraction ?? {}) as { legibility?: string; transcript?: string; ds160Part?: string };
                  const notes = [
                    x.legibility && x.legibility !== "clear" ? `legibility: ${x.legibility.replace("_", " ")}` : "",
                    x.transcript === "failed" ? "full text missing" : "",
                    x.ds160Part === "confirmation_page" ? "confirmation page only" : "",
                  ].filter(Boolean);
                  return [
                    formatDateTime(d.created_at),
                    capitalize(documentLabel(d.kind)),
                    d.extraction_status === "failed" ? <span key="e" className="text-refused">Failed{d.extraction_error ? `: ${d.extraction_error}` : ""}</span> : capitalize(d.extraction_status),
                    notes.join(" · ") || "—",
                    d.extraction_status === "failed" || x.transcript === "failed" ? (
                      <form key="r" action={retryJob.bind(null, "extraction", d.id, back)}>
                        <button className="underline underline-offset-2">Read again</button>
                      </form>
                    ) : (
                      ""
                    ),
                  ];
                })}
                empty="No documents."
              />
            </Section>

            <Section title="Packs">
              <Table
                head={["Pack", "Credits", "Paid", "Reference", "Bought", "Status"]}
                rows={passes.map((p) => [
                  packLabel(p.plan),
                  `${p.interviews} interviews · ${p.drills} drills`,
                  p.amount_pesewas ? ghs(p.amount_pesewas) : "Comped",
                  <span key="r" className="font-mono text-xs">{p.paystack_reference}</span>,
                  formatDate(p.purchased_at),
                  new Date(p.expires_at) < new Date() ? "Expired" : `Use by ${formatDate(p.expires_at)}`,
                ])}
                empty="No packs."
              />
              <div className="mt-4 space-y-3 rounded-[4px] border border-line p-4">
                <p className="text-sm font-medium">Grant a comped pack</p>
                <ReasonForm action={grantPass.bind(null, id, c.id)} label="Grant">
                  <select name="plan" className={`${inputCls} w-auto py-1.5 text-sm`}>
                    <option value="full">Full Prep (10 interviews, 60 drills)</option>
                    <option value="prep">Prep (4 interviews, 20 drills)</option>
                    <option value="topup">Top-up (3 interviews, 15 drills)</option>
                  </select>
                </ReasonForm>
              </div>
            </Section>

            <Section title="Facts">
              <div className="rounded-[4px] border border-line p-4">
                {factsCase?.id === c.id ? (
                  <>
                    <p className="text-sm font-medium">Confirmed facts (access logged)</p>
                    <pre className="mt-3 max-h-96 overflow-auto rounded-[3px] bg-fg/[0.04] p-4 text-xs">{JSON.stringify(factsCase?.profile, null, 2) ?? "No confirmed facts."}</pre>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">Facts are hidden</p>
                    <p className="mb-3 mt-1 text-xs text-muted">Only open them for support the user asked for. Your reason is logged.</p>
                    <ReasonForm action={viewCaseFacts.bind(null, id, c.id)} label="Show facts" />
                  </>
                )}
              </div>
            </Section>
          </div>
        );
      })}

      <Section title="What they've used">
        <Table
          head={["Feature", "Times"]}
          rows={Object.entries(EVENT_NAMES).map(([k, label]) => [label, usage.get(k) ?? 0])}
          sortValues={Object.entries(EVENT_NAMES).map(([k, label]) => [label, usage.get(k) ?? 0])}
        />
      </Section>

      <Section title="Their data" note="For requests under Ghana's Data Protection Act. Both are logged with your reason.">
        <div className="space-y-4">
          <div className="rounded-[4px] border border-line p-4">
            <p className="text-sm font-medium">Export everything</p>
            <p className="mb-3 mt-1 text-xs text-muted">Account, facts, notes, documents, sessions, answers, grades, payments and usage, as JSON, with 24-hour links to their files.</p>
            {exportReady ? (
              <a href={`/admin/users/${id}/export`} className="inline-block rounded-[3px] bg-ink px-4 py-2 text-sm font-semibold text-on-ink hover:bg-stamp">
                Download export
              </a>
            ) : (
              <ReasonForm action={exportUser.bind(null, id)} label="Prepare export" />
            )}
          </div>
          {profile.role !== "admin" && id !== admin.id && (
            <div className="rounded-[4px] border border-refused/40 p-4">
              <p className="text-sm font-medium text-refused">Delete this account and all its data</p>
              <p className="mb-3 mt-1 text-xs text-muted">
                Removes the login, facts, documents, recordings, sessions and share links. Payment references and amounts are kept in the
                audit log for accounting; no money is returned. This can&rsquo;t be undone.
              </p>
              <ReasonForm action={deleteUser.bind(null, id)} label="Delete permanently" danger>
                <input name="confirm" required placeholder="Type their email to confirm" className={`${inputCls} max-w-xs py-1.5 text-sm`} />
              </ReasonForm>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
