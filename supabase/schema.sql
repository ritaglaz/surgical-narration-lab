-- Surgical Operative Note Lab — Supabase / PostgreSQL schema
-- Run in the Supabase SQL editor when migrating from local SQLite.
-- This mirrors the local MVP tables and supports roles for later use.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null default 'narrator' check (role in ('admin', 'narrator')),
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  procedure_type text not null,
  description text,
  case_id text,
  video_storage_path text not null,
  duration double precision,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.narrations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  narration_mode text not null check (narration_mode in ('synchronized', 'dictation')),
  audio_storage_path text,
  recording_duration double precision,
  video_start_timestamp double precision not null default 0,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_videos_uploaded_by on public.videos(uploaded_by);
create index if not exists idx_videos_procedure on public.videos(procedure_type);
create index if not exists idx_narrations_video on public.narrations(video_id);
create index if not exists idx_narrations_user on public.narrations(user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'narrator'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.narrations enable row level security;

-- Authenticated users can read profiles (minimal fields used by UI)
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "videos_select_authenticated"
  on public.videos for select
  to authenticated
  using (true);

create policy "videos_insert_authenticated"
  on public.videos for insert
  to authenticated
  with check (auth.uid() = uploaded_by);

create policy "videos_update_own_or_admin"
  on public.videos for update
  to authenticated
  using (
    auth.uid() = uploaded_by
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "narrations_select_authenticated"
  on public.narrations for select
  to authenticated
  using (true);

create policy "narrations_insert_own"
  on public.narrations for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "narrations_update_own_or_admin"
  on public.narrations for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
