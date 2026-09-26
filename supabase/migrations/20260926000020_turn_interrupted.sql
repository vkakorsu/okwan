-- The officer started speaking before the applicant had finished (a deliberate cut-in, or
-- talking over them). The grader doesn't count an unfinished answer against the applicant.
alter table public.turns add column if not exists interrupted boolean not null default false;
