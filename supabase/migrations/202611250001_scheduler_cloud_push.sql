-- My Scheduler cloud sync and web-push storage.
create table if not exists public.scheduler_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  records jsonb not null default '[]'::jsonb,
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);
alter table public.scheduler_records enable row level security;
create policy "Users manage own scheduler records" on public.scheduler_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "Users manage own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.reminder_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  occurrence_date date not null,
  reminder_offset integer not null check (reminder_offset in (0, 10, 30)),
  delivered_at timestamptz not null default now(),
  unique(user_id, record_id, occurrence_date, reminder_offset)
);
alter table public.reminder_deliveries enable row level security;
-- No client policies: only the server-side service role may write/read delivery history.

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

-- Enable Realtime notifications for schedule changes (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scheduler_records'
  ) then
    alter publication supabase_realtime add table public.scheduler_records;
  end if;
end $$;
