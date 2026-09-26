/**
 * One place for every key. Each feature checks `features.x` and shows a clear
 * "not configured" state instead of failing mysteriously. Names accept both
 * the Vercel ↔ Supabase integration variables and Supabase's newer key names.
 */

import { DEFAULT_FREE_SESSIONS_PER_DAY } from "@/lib/domain/abuse";
import { siteOrigin } from "@/lib/site";

const first = (...names: string[]) => {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
};

/**
 * The okwan Supabase project's public values. They are designed to be public
 * (RLS protects the data), so they're safe as defaults; env vars override them.
 */
const OKWAN_SUPABASE_URL = "https://itvgkkwsxyobkwkrrrwg.supabase.co";
const OKWAN_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_I6nN-G2fBJGDkNydeRnuZQ_6xZqA4Vc";

export const env = {
  siteUrl: siteOrigin("http://localhost:3000"),

  supabaseUrl: first("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL") ?? OKWAN_SUPABASE_URL,
  supabasePublishableKey:
    first(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
    ) ?? OKWAN_SUPABASE_PUBLISHABLE_KEY,
  supabaseSecretKey: first("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),

  geminiApiKey: first("GEMINI_API_KEY", "GOOGLE_API_KEY"),
  // Verified against the live API on 26 Sep 2026 (/admin/health).
  geminiLiveModel: first("GEMINI_LIVE_MODEL") ?? "gemini-3.8-live",
  geminiFlashModel: first("GEMINI_FLASH_MODEL") ?? "gemini-3.8-flash",
  /** Speech for "hear the stronger answer" (docs/PLAN.md §3). */
  geminiTtsModel: first("GEMINI_TTS_MODEL") ?? "gemini-3.8-flash-tts",
  // Tried in order when the main Flash model is overloaded.
  geminiFlashFallbacks: (first("GEMINI_FLASH_FALLBACKS") ?? "gemini-3.7-flash,gemini-3.5-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),

  paystackSecretKey: first("PAYSTACK_SECRET_KEY"),

  // Cloudflare Turnstile on sign-up, sign-in and password reset. Only shown
  // when set; turn on CAPTCHA protection in Supabase Auth with the secret key.
  turnstileSiteKey: first("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
  // Free sessions started across all accounts per 24 hours: a ceiling on a sign-up flood.
  freeSessionsPerDay: Number(first("FREE_SESSIONS_PER_DAY") ?? DEFAULT_FREE_SESSIONS_PER_DAY),

  // Cedis per US dollar, for converting statement balances. Approximate: the
  // user sees the conversion and confirms or corrects the dollar figure.
  fxGhsPerUsd: Number(first("FX_GHS_PER_USD") ?? 11.5),
};

export const features = {
  get supabase() {
    return Boolean(env.supabaseUrl && env.supabasePublishableKey);
  },
  get supabaseAdmin() {
    return Boolean(env.supabaseUrl && env.supabaseSecretKey);
  },
  get gemini() {
    return Boolean(env.geminiApiKey);
  },
  get paystack() {
    return Boolean(env.paystackSecretKey);
  },
};

export function requireEnv<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${name} is not configured. See .env.example.`);
  }
  return value;
}
