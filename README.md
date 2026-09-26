# Okwan

US visa interview practice built for Ghanaians. You upload your documents, then practise with a simulated consular officer who has read your case. Every session is a different officer. After each one you get an honest debrief, grounded only in your own facts.

> Okwan means *the way / the road* in Twi.

## Docs
- [`docs/PLAN.md`](docs/PLAN.md): product, engineering, design and SEO plan, with sources
- [`docs/PRICING.md`](docs/PRICING.md): pricing, unit economics and pass rules
- [`docs/EXPERTS.md`](docs/EXPERTS.md): human coaches and senior experts

## What's built

| Area | Where |
|---|---|
| **Interview engine**: the Director (plans each session per user), the probe taxonomy, officer sampling, Case Scan, the Referee (rules-based outcomes), officer instructions, the rewrite validator, delivery metrics | `src/lib/domain/` |
| **Pass rules and entitlements**: the 60-day ceiling, appointment proof, date moves, free and sprint limits | `src/lib/domain/pass.ts`, `entitlement.ts` |
| **Marketing site and SEO** | `src/app/page.tsx`, `src/components/home/`, `src/app/{robots,sitemap,manifest,opengraph-image}` |
| **Auth**: phone code and Google (Supabase), session refresh in `src/proxy.ts` | `src/app/login`, `src/app/auth` |
| **Cases, documents and fact extraction** (Gemini Flash, with disagreements between documents flagged), and the confirm-your-facts form | `src/app/app/cases/[id]/…`, `src/lib/server/jobs.ts` |
| **The live Window**: Gemini 3.8 Live via a single-use locked token, with a server-side Referee | `src/components/app/live-room.tsx`, `src/app/api/sessions/…` |
| **Debrief**: rules-based outcome and reasons, scores, red flags, validated "stronger answer", delivery metrics | `src/app/app/sessions/[id]/debrief` |
| **Payments**: Paystack MoMo and card, signed webhook, idempotent passes | `src/lib/server/paystack.ts`, `src/app/api/paystack/webhook` |
| **Database**: schema, RLS, tamper guards, storage buckets | `supabase/migrations/` |
| **Privacy**: daily deletion of expired documents | `src/app/api/cron/cleanup`, `vercel.json` |

**Keys:** see [`docs/SETUP.md`](docs/SETUP.md). `/setup` shows which integrations are connected.

## Develop

```bash
pnpm install
cp .env.example .env.local   # fill in what you have
pnpm dev                     # http://localhost:3000
```

| Command | What it does |
|---|---|
| `pnpm test` | Engine, Referee, pass-rule and Case Scan tests (Vitest) |
| `pnpm test:db` | Runs the core migration and RLS tests on a throwaway Postgres 16. Run it as a non-root user, because `initdb` refuses to run as root. |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | The usual checks |
| `pnpm audio:hero` | Renders the hero's officer questions to `public/audio/`. Needs `GEMINI_API_KEY`. |

Apply the migrations with the Supabase CLI (`supabase db push`). The second migration needs pgvector, which Supabase enables by default.

This app runs **Next.js 16**. Read `AGENTS.md` before changing framework code.
