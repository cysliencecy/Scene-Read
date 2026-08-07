-- Additive compatibility migration: legacy scene/character values stay readable.
alter table public.scene_candidates add column if not exists classification_snapshot jsonb;
alter table public.scene_candidates add column if not exists classification_status text;
alter table public.scene_candidates add column if not exists contract_version text;
alter table public.scene_candidates add column if not exists profile_version text;
alter table public.scene_candidates drop constraint if exists scene_candidates_image_type_check;
alter table public.scene_candidates add constraint scene_candidates_image_type_check
  check (image_type in ('scene', 'character', 'environment', 'portrait', 'interaction', 'action', 'object', 'atmosphere'));
alter table public.scene_candidates drop constraint if exists scene_candidates_classification_status_check;
alter table public.scene_candidates add constraint scene_candidates_classification_status_check
  check (classification_status is null or classification_status in ('eligible', 'below_threshold', 'invalid'));

create table if not exists public.book_visual_profiles (
  id text primary key default gen_random_uuid()::text,
  book_id text not null references public.books(id) on delete cascade,
  entity_type text not null check (entity_type in ('character', 'location')),
  entity_key text not null,
  stable_facts jsonb not null default '[]'::jsonb,
  flexible_facts jsonb not null default '[]'::jsonb,
  version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, entity_type, entity_key)
);

create table if not exists public.image_generation_attempts (
  id text primary key default gen_random_uuid()::text,
  idempotency_key text not null unique,
  candidate_id text not null references public.scene_candidates(id) on delete cascade,
  task_id text not null references public.generation_tasks(id) on delete cascade,
  parent_attempt_id text references public.image_generation_attempts(id) on delete set null,
  trigger text not null check (trigger in ('automatic', 'manual')),
  requested_type text not null check (requested_type in ('environment', 'portrait', 'interaction', 'action', 'object', 'atmosphere')),
  overridden_from text check (overridden_from in ('scene', 'character', 'environment', 'portrait', 'interaction', 'action', 'object', 'atmosphere')),
  status text not null check (status in ('queued', 'generation_failed', 'audit_failed', 'blocked', 'publishable')),
  classification_snapshot jsonb,
  prompt text not null,
  contract_version text,
  profile_version text,
  provider text,
  model text,
  width integer,
  height integer,
  image_url text,
  artifact_metadata jsonb,
  audit jsonb,
  audit_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scene_images add column if not exists candidate_id text references public.scene_candidates(id) on delete set null;
alter table public.scene_images add column if not exists attempt_id text references public.image_generation_attempts(id) on delete set null;
alter table public.scene_images drop constraint if exists scene_images_image_type_check;
alter table public.scene_images add constraint scene_images_image_type_check
  check (image_type in ('scene', 'character', 'environment', 'portrait', 'interaction', 'action', 'object', 'atmosphere'));
alter table public.scene_images drop constraint if exists scene_images_candidate_projection_key;
alter table public.scene_images add constraint scene_images_candidate_projection_key unique (candidate_id);

drop trigger if exists set_book_visual_profiles_updated_at on public.book_visual_profiles;
create trigger set_book_visual_profiles_updated_at before update on public.book_visual_profiles
for each row execute function public.set_updated_at();
drop trigger if exists set_image_generation_attempts_updated_at on public.image_generation_attempts;
create trigger set_image_generation_attempts_updated_at before update on public.image_generation_attempts
for each row execute function public.set_updated_at();

alter table public.book_visual_profiles enable row level security;
alter table public.image_generation_attempts enable row level security;
