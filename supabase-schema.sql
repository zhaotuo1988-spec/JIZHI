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

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
alter table public.profiles enable row level security;
alter table public.logs enable row level security;
alter table public.concrete_records enable row level security;

drop policy if exists "profiles owner read" on public.profiles;
create policy "profiles owner read"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "profiles owner display update" on public.profiles;

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
create index if not exists idx_profiles_role_status on public.profiles(role, status);
create index if not exists idx_logs_owner_project_date on public.logs(owner_id, project_id, date desc);
create index if not exists idx_concrete_owner_project_created on public.concrete_records(owner_id, project_id, created_at desc);

-- First admin bootstrap:
-- 1. Create the first admin user in MemFire/Supabase Auth console.
-- 2. Replace the email below and run it once.
--
-- insert into public.profiles (user_id, email, display_name, role, status)
-- select id, email, coalesce(raw_user_meta_data->>'display_name', email), 'admin', 'active'
-- from auth.users
-- where email = 'admin@example.com'
-- on conflict (user_id) do update
-- set role = 'admin', status = 'active', updated_at = now();
