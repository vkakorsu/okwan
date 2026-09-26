import Link from "next/link";
import type { DailyPlan, PlanTask } from "@/lib/domain/daily-plan";
import { Card } from "./ui";

/** Where each task is done. Tasks without a link are done away from the screen. */
function href(task: PlanTask["id"]): string | null {
  switch (task) {
    case "quiz":
      return `/app/facts`;
    case "day_guide":
      return `/app/day`;
    case "pack":
      return `/app#bring`;
    case "report":
      return `/app#outcome`;
    case "set_date":
      return `/app#countdown`;
    case "drill":
    case "story":
      return `/app#fix`;
    case "interview":
    case "tough_interview":
    case "dress_rehearsal":
      return `/app#practice`;
    default:
      return null;
  }
}

export function DailyPlanCard({ plan, hasDate }: { plan: DailyPlan; hasDate: boolean }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl uppercase">Today&rsquo;s plan</h2>
        {hasDate && (
          <a href={`/app/calendar`} className="text-sm underline underline-offset-4">
            Add reminders to my calendar
          </a>
        )}
      </div>
      <p className="mt-1 text-sm">
        <span className="font-semibold">{plan.title}.</span> <span className="text-muted">{plan.rhythm}</span>
      </p>
      {plan.today.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {plan.today.map((t) => {
            const link = href(t.id);
            return (
              <li key={t.id} className="flex items-start gap-2">
                <span
                  aria-label={t.done ? "Done" : "To do"}
                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border border-ink text-[10px] ${t.done ? "bg-ink text-on-ink" : ""}`}
                >
                  {t.done ? "✓" : ""}
                </span>
                {link ? (
                  <Link href={link} className={`underline-offset-2 hover:underline ${t.done ? "text-muted line-through" : ""}`}>
                    {t.label}
                  </Link>
                ) : (
                  <span className={t.done ? "text-muted line-through" : ""}>{t.label}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
