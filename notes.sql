-- Ensure gen_random_uuid() is available
create extension if not exists pgcrypto;

-- 1) Table
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  content    text,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Trigger: keep updated_at fresh
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.notes;
create trigger set_updated_at
before update on public.notes
for each row
execute function public.handle_updated_at();

-- 3) Enable Row Level Security
alter table public.notes enable row level security;

-- 4) Policies (authenticated users only, limited to own rows)
drop policy if exists "Read own notes"   on public.notes;
drop policy if exists "Insert own notes" on public.notes;
drop policy if exists "Update own notes" on public.notes;
drop policy if exists "Delete own notes" on public.notes;

create policy "Read own notes"
on public.notes
for select
to authenticated
using (user_id = auth.uid());

create policy "Insert own notes"
on public.notes
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Update own notes"
on public.notes
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Delete own notes"
on public.notes
for delete
to authenticated
using (user_id = auth.uid());
