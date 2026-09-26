import "server-only";
import { features } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Feature usage, for the admin's "what do people use?" view. Best effort:
 * a failed write never breaks the page or action that called it. Names are
 * short snake_case; props hold ids and small facts, never personal content.
 */
export const EVENT_NAMES = {
  debrief_viewed: "Viewed a debrief",
  facts_viewed: "Opened Know your file",
  day_viewed: "Opened Interview day",
  refused_viewed: "Opened Refused before",
  progress_viewed: "Opened Progress",
  social_viewed: "Opened Social media check",
  share_created: "Created a share link",
  share_opened: "Shared debrief opened",
  hear_it: "Played a stronger answer",
  calendar_downloaded: "Added calendar reminders",
} as const;
export type EventName = keyof typeof EVENT_NAMES;

export async function track(userId: string | null, name: EventName, props: Record<string, string | number | boolean> = {}) {
  if (!features.supabaseAdmin) return;
  try {
    await createServiceClient().from("events").insert({ user_id: userId, name, props });
  } catch {
    // Usage stats never get in the way.
  }
}
