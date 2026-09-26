# Setup: drop in the keys

The app runs without any keys. Each feature shows a "not configured" state until its keys are set, and `/setup` lists which integrations are connected (it never shows the values).

## 1. Supabase

**Status (26 Sep 2026):**
- Project **`okwan`** (ref `itvgkkwsxyobkwkrrrwg`, eu-west-1) has all seventeen migrations applied, and an admin invite is set for the owner's email. The security advisors are clean apart from intentional notes: `asked_questions`, `admin_audit_log`, `admin_invites` and `document_reads` are server-only.
- **Remaining steps:** set the environment variables in Vercel (step 1) and enable Phone auth (step 3). Step 2 is already done for this project.


1. **Environment variables.** If Supabase is connected through the Vercel integration, these are already set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
   - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)

   The app accepts either naming.
2. **Migrations:** `supabase link --project-ref <ref>`, then `supabase db push`. This applies the files in `supabase/migrations/` in order. The second one enables pgvector.
3. **Auth → Providers:**
   - **Phone:** turn it on and pick an SMS provider (Twilio, Vonage or MessageBird). Test delivery to MTN, Telecel and AirtelTigo numbers before launch.
   - **Google:** optional. If you use it, add `https://<your-domain>/auth/callback` to the redirect URLs.
4. **Auth → URL configuration:** set the Site URL to your domain.
5. **Storage:** the `documents` and `recordings` buckets and their owner-only policies are created by migration `20260926000003_app.sql`.
6. **Document deletion:** `vercel.json` runs `/api/cron/cleanup` daily. It deletes documents past `delete_after` (30 days) from both Storage and the database. Set `CRON_SECRET` in Vercel so only the cron can call it.

## Admin dashboard (`/admin`)
- **Apply migration `20260926000005_admin.sql`** (the audit log). Until it's applied, sensitive actions are blocked: viewing case facts, comped passes and role changes.
- **Make someone an admin** in the Supabase SQL editor:
  `insert into public.admin_invites (email) values ('you@example.com');` (becomes admin on sign-up), or for an existing account `update public.profiles set role = 'admin' where email = 'you@example.com';`
- **Access control:**
  - Anyone who isn't an admin gets a 404 at `/admin`.
  - Every sensitive action needs a written reason, which is stored in the audit log.
  - Case facts only appear for 10 minutes after the reason has been logged.

## 2. Gemini
- `GEMINI_API_KEY`: from Google AI Studio. **Use a paid-tier key**, so prompts and documents aren't used for training.
- `GEMINI_LIVE_MODEL` (default `gemini-3.8-live`) and `GEMINI_FLASH_MODEL` (default `gemini-3.8-flash`). **Check both ids against the Gemini models page.** They were written from the launch announcements, not tested against the API.
- Optional: run `pnpm audio:hero` to pre-render the homepage officer voices with 3.8 Flash TTS.

## 3. Paystack
- `PAYSTACK_SECRET_KEY`: use `sk_test_…` first, then switch to live.
- In the Paystack dashboard, set the **webhook URL** to `https://<your-domain>/api/paystack/webhook`.
- Enable Mobile Money (MTN, Telecel, AirtelTigo) and cards for the GHS currency.

## 4. Site
- `NEXT_PUBLIC_SITE_URL`: e.g. `https://okwan.ai`. It's used for canonical URLs, the sitemap and the Paystack return URL.

## 5. Bot protection (Cloudflare Turnstile)
Do these in order, or sign-in breaks in between:
1. In the Cloudflare dashboard, open **Turnstile → Add widget**. Add your domain (and `okwan-phi.vercel.app`) and choose **Managed**. Copy the site key and the secret key.
2. In Vercel, set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the site key and redeploy. The check appears on sign-up, sign-in and password reset.
3. In Supabase, open **Authentication → Attack Protection**, turn on **CAPTCHA protection**, choose **Turnstile** and paste the secret key.

Also keep **Confirm email** on (Authentication → Sign In / Providers → Email): the free sessions need a confirmed email.
Optional: `FREE_SESSIONS_PER_DAY` (default 300) caps free sessions across everyone per 24 hours.

## How a session flows (for debugging)

1. **Start.** `startSession` (server action):
   - checks the pass (`caseEntitlement`)
   - asks the Director for a plan
   - inserts `sessions` using the service role
2. **The room connects.** The room calls `POST /api/sessions/:id/token`. This mints a single-use Gemini Live token with the officer's system instruction, voice and tools locked server-side. The browser then connects directly to Gemini Live.
3. **During the interview.** The Officer's tool calls (`log_probe`, `log_inconsistency`, `log_document`, `end_interview`) are relayed to `POST /api/sessions/:id/events`. The server Referee:
   - applies them
   - writes `probe_results`
   - decides the outcome by rules
4. **End.** `POST /api/sessions/:id/complete` stores the transcript and outcome. Then `after()` runs the debrief grading (Gemini Flash plus the rewrite validator).

## Known limits of this version
- **Tool calls are relayed by the browser**, so a determined user could fake their own scores. It only affects their own practice. A server-side LiveKit agent (docs/PLAN.md §4.3) removes this.
- **The transcript is split into turns from Gemini's live transcription.** A late transcription can occasionally land in the next turn. The post-session transcript pass (Gemini 3.5 Transcribe) is still to do.
- **Background jobs use `after()`.** If extraction or grading outgrows the function time limit, move them to Inngest.
- **The Family Pass isn't self-serve yet,** because it needs two linked cases.
