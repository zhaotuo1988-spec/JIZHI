-- Minimal Supabase/MemFire schema for Smart Supervisor Log.
-- Run this once in the SQL editor before production use.

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  project_number text,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  date date not null,
  weather text,
  location text,
  messages jsonb not null default '[]'::jsonb,
  report jsonb,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  linked_records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.concrete_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  date date not null,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.logs enable row level security;
alter table public.concrete_records enable row level security;

drop policy if exists "projects owner access" on public.projects;
create policy "projects owner access"
on public.projects
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "logs owner access" on public.logs;
create policy "logs owner access"
on public.logs
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "concrete owner access" on public.concrete_records;
create policy "concrete owner access"
on public.concrete_records
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create index if not exists idx_projects_owner_id on public.projects(owner_id);
create index if not exists idx_logs_owner_project_date on public.logs(owner_id, project_id, date desc);
create index if not exists idx_concrete_owner_project_created on public.concrete_records(owner_id, project_id, created_at desc);
