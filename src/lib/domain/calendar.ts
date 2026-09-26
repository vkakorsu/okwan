/**
 * Reminders without an email or SMS provider: a calendar file (.ics) the
 * applicant adds once. Their phone then reminds them to practise each evening,
 * to do a dress rehearsal two days before, and about the interview itself.
 * RFC 5545; Accra is UTC all year, so times are written in UTC.
 */

export interface CalendarInput {
  caseId: string;
  applicantName: string;
  interviewAt: string;
  siteUrl: string;
  now?: number;
}

const DAY = 24 * 60 * 60 * 1000;

const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
/** Text values escape backslashes, commas, semicolons and newlines. */
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded (continued with a leading space). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

function event(e: { uid: string; start: number; minutes: number; title: string; body: string; url: string; rrule?: string; alarmsMin: number[]; now: number }): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(e.now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.start + e.minutes * 60_000)}`,
    ...(e.rrule ? [`RRULE:${e.rrule}`] : []),
    `SUMMARY:${text(e.title)}`,
    `DESCRIPTION:${text(e.body)}`,
    `URL:${e.url}`,
    ...e.alarmsMin.flatMap((m) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${text(e.title)}`, `TRIGGER:-PT${m}M`, "END:VALARM"]),
    "END:VEVENT",
  ];
}

export function practiceCalendar(i: CalendarInput): string {
  const now = i.now ?? Date.now();
  const interview = Date.parse(i.interviewAt);
  const caseUrl = `${i.siteUrl}/app`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Okwan//Interview practice//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${text("Okwan: visa interview")}`];

  const today = Math.floor(now / DAY) * DAY;
  const lastPractice = Math.floor(interview / DAY) * DAY - 3 * DAY;
  // Evening practice at 19:00, from tomorrow until three days before.
  const firstPractice = today + DAY + 19 * 3600_000;
  if (firstPractice < lastPractice + 19 * 3600_000) {
    lines.push(
      ...event({
        uid: `practice-${i.caseId}@okwan`,
        start: firstPractice,
        minutes: 15,
        rrule: `FREQ=DAILY;UNTIL=${dateOnly(lastPractice)}T235959Z`,
        title: "Visa interview practice (15 min)",
        body: `One interview or a drill of your weakest answer. ${caseUrl}`,
        url: caseUrl,
        alarmsMin: [0],
        now,
      }),
    );
  }
  const rehearsal = Math.floor(interview / DAY) * DAY - 2 * DAY + 19 * 3600_000;
  if (rehearsal > now) {
    lines.push(
      ...event({
        uid: `rehearsal-${i.caseId}@okwan`,
        start: rehearsal,
        minutes: 20,
        title: "Dress rehearsal for your visa interview",
        body: `Standing, dressed as you'll be, with a tough officer. Then read the day-of guide. ${caseUrl}/day`,
        url: `${caseUrl}/day`,
        alarmsMin: [0],
        now,
      }),
    );
  }
  if (interview > now) {
    lines.push(
      ...event({
        uid: `interview-${i.caseId}@okwan`,
        start: interview,
        minutes: 120,
        title: "US visa interview, US Embassy Accra",
        body: `Passport, DS-160 confirmation, appointment letter and your folder. Day-of guide: ${caseUrl}/day`,
        url: `${caseUrl}/day`,
        alarmsMin: [24 * 60, 120],
        now,
      }),
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
