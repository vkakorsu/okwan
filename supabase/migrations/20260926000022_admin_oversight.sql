-- Feature usage: a small, append-only log of what people use (src/lib/server/events.ts).
-- Written by the server only; read by the admin pages with the service role.
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (name ~ '^[a-z_]{2,40}$'),
  props jsonb not null default '{}',
  at timestamptz not null default now()
);
create index events_at_idx on public.events (at desc);
create index events_name_at_idx on public.events (name, at desc);
create index events_user_idx on public.events (user_id);
alter table public.events enable row level security;
-- No policies: users can't read or write events.

-- New audited admin actions: opening a session, exporting or deleting a user's data, retrying a failed job.
alter table public.admin_audit_log drop constraint if exists admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in (
  'view_case_facts', 'refund_pass', 'grant_pass', 'set_role',
  'view_session', 'export_user', 'delete_user', 'retry_job'
));
