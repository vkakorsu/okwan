import type { CaseProfile } from "./case";

/**
 * Social media self-check. Since June 2025, F, M and J applicants must set
 * their accounts to public, and officers check the profiles listed on the
 * DS-160 match the application (docs/INTERVIEW-REALISM.md §10). This is a
 * review list, personalised from the confirmed facts. It never tells anyone
 * to hide or delete: deleting accounts listed on the DS-160, or content just
 * before the interview, looks worse than the content.
 */

export interface SocialItem {
  /** Stored with the packing list ticks (cases.checklist_packed); must match CHECKLIST_ID. */
  id: string;
  title: string;
  detail: string;
}

export const SOCIAL_PREFIX = "sm_";

export function socialChecklist(c: CaseProfile): SocialItem[] {
  const student = c.visaType === "F1";
  const job = c.ties.employer ? `${c.ties.role ? `${c.ties.role} at ` : ""}${c.ties.employer}` : null;
  const items: (SocialItem | null)[] = [
    student
      ? {
          id: "sm_public",
          title: "Every account is set to public",
          detail: "Students must set all their social media to public before the interview. A private account can hold up your application.",
        }
      : {
          id: "sm_public",
          title: "Know what's public on your accounts",
          detail: "Visitors don't have to go public, but officers may still see what is. Look at your profiles as a stranger would.",
        },
    {
      id: "sm_listed",
      title: "Every handle is on your DS-160",
      detail: "The DS-160 asks for every account you've used in the last five years, on about 20 platforms. One you left off, that an officer finds, looks like hiding something.",
    },
    student && c.study
      ? {
          id: "sm_school",
          title: `Your education matches: ${c.study.school}, ${c.study.program}`,
          detail: `Where LinkedIn or Facebook lists your school or plans, it should say the same as your I-20.${c.education?.lastSchool ? ` Your past study should show ${c.education.lastSchool}.` : ""}`,
        }
      : null,
    job
      ? {
          id: "sm_work",
          title: `Your work matches: ${job}`,
          detail: "Your job title, employer and dates on LinkedIn and Facebook should match your DS-160 and employment letter.",
        }
      : {
          id: "sm_work",
          title: "Your work history matches your DS-160",
          detail: "If your profiles list jobs, they should match what's on your form, with the same dates.",
        },
    {
      id: "sm_family",
      title: `Your relationship status matches: ${c.applicant.maritalStatus}`,
      detail: "A relationship status, a wedding photo or a spouse tagged in posts that differs from your form invites questions.",
    },
    {
      id: "sm_plans",
      title: student ? "Nothing says you plan to stay in the US" : "Nothing says you plan to stay, work or move",
      detail: student
        ? "Posts like \"relocating to the US for good\", \"never coming back\" or job hunting in the US contradict your intention to return. Posts about your career in Ghana support it."
        : "Posts about moving abroad, job hunting in the US, or a much longer trip than your form says contradict your application.",
    },
    c.usContacts.length
      ? {
          id: "sm_relatives",
          title: "Your US relatives match your form",
          detail: `You listed ${c.usContacts.map((u) => u.relationship).join(", ")}. Relatives in the US you're clearly connected to online, but left off your form, will be noticed.`,
        }
      : {
          id: "sm_relatives",
          title: "No close US relatives missing from your form",
          detail: "Your form lists no relatives in the US. If a parent, sibling or spouse there is obvious from your profiles, your form should say so.",
        },
    {
      id: "sm_nothing_deleted",
      title: "You haven't deleted accounts or posts to hide them",
      detail: "Deleting an account listed on your DS-160, or wiping posts just before the interview, looks worse than almost any post. If something is true, be ready to explain it; if your form is wrong, fix the form.",
    },
    {
      id: "sm_nothing_harmful",
      title: "Nothing hostile, violent or extremist",
      detail: "Officers screen for support of violence or designated groups, and hostility towards the US. If something could be misread, be ready to explain it honestly.",
    },
  ];
  return items.filter((i): i is SocialItem => Boolean(i));
}
