import Link from "next/link";
import { notFound } from "next/navigation";
import { setPacked } from "@/app/app/actions";
import { SocialChecklist } from "@/components/app/social-checklist";
import { BackLink, Card, PageTitle } from "@/components/app/ui";
import { socialChecklist } from "@/lib/domain/social-check";
import { requireUser } from "@/lib/server/auth";
import { getCase, latestProfile } from "@/lib/server/repo";

export const metadata = { title: "Social media check" };

export default async function SocialPage(props: PageProps<"/app/cases/[id]/social">) {
  const { id } = await props.params;
  const { supabase } = await requireUser(`/app/cases/${id}/social`);
  const caseRow = await getCase(supabase, id);
  if (!caseRow) notFound();
  const current = await latestProfile(supabase, id);
  const student = caseRow.visa_type === "F1";

  return (
    <>
      <BackLink href={`/app/cases/${id}`}>{caseRow.applicant_name}</BackLink>
      <PageTitle eyebrow="Social media check" title="Do your profiles tell the same story?">
        {student
          ? "Student applicants must make their social media public, and officers check it matches the application. "
          : "Officers can look at your public profiles and compare them with your application. "}
        Go through your accounts as a stranger would, and tick each item once it&rsquo;s true.
      </PageTitle>
      {!current ? (
        <p className="text-sm">
          First, <Link className="underline" href={`/app/cases/${id}/profile`}>confirm your facts</Link>: this list is built from them.
        </p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card>
            <SocialChecklist items={socialChecklist(current.profile)} checked={caseRow.checklist_packed ?? []} setChecked={setPacked.bind(null, id)} />
          </Card>
          <Card>
            <h2 className="font-display text-2xl uppercase">The rule</h2>
            <p className="mt-2 text-sm">
              Don&rsquo;t hide, don&rsquo;t delete. If a profile is true and your form is true, they match. If they don&rsquo;t, the fix is to
              correct whichever is wrong, and be ready to explain it, not to scrub your accounts before the interview.
            </p>
            <p className="mt-3 text-xs text-muted">
              General information, not legal advice. Okwan never asks for your social media passwords or handles.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
