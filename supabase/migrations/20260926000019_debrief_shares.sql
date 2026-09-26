-- Read-only links to one debrief, for a parent, sponsor or counsellor (src/app/share/[token]).
-- The token is the secret: 32 random URL-safe characters. Links expire and can be revoked.
-- Created and read by the server only; owners can list and revoke their own through RLS.
create table public.debrief_shares (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{32}$'),
  session_id uuid not null references public.sessions (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz
);
create index debrief_shares_session_idx on public.debrief_shares (session_id);
create index debrief_shares_owner_idx on public.debrief_shares (created_by);

alter table public.debrief_shares enable row level security;
create policy "own shares: read" on public.debrief_shares for select
  using (created_by = (select auth.uid()));
-- Owners may only revoke (set revoked_at); everything else is fixed.
create policy "own shares: revoke" on public.debrief_shares for update
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
revoke update on public.debrief_shares from authenticated;
grant update (revoked_at) on public.debrief_shares to authenticated;
