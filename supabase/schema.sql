create extension if not exists pgcrypto;

create table if not exists public.books (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  progress text not null default '0%',
  accent text not null default '#2f4a40',
  current_chapter_id text not null,
  last_read_label text not null default '准备开始第一章',
  visual_style text check (visual_style in ('写实', '动漫', '插画')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

update public.books
set visual_style = null
where visual_style is not null
  and visual_style not in ('写实', '动漫', '插画');

alter table public.books drop constraint if exists books_visual_style_check;
alter table public.books
  add constraint books_visual_style_check check (visual_style in ('写实', '动漫', '插画'));

create table if not exists public.chapters (
  id text primary key default gen_random_uuid()::text,
  book_id text not null references public.books(id) on delete cascade,
  title text not null,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_tasks (
  id text primary key default gen_random_uuid()::text,
  book_id text references public.books(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  status text not null default 'queued' check (status in ('queued', 'recognizing', 'generating', 'completed', 'failed')),
  task_type text not null default 'scene_image' check (task_type in ('scene_image')),
  label text not null,
  error_message text,
  provider text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.generation_tasks add column if not exists book_id text references public.books(id) on delete cascade;
alter table public.generation_tasks add column if not exists task_type text not null default 'scene_image';
alter table public.generation_tasks add column if not exists error_message text;
alter table public.generation_tasks add column if not exists provider text;
alter table public.generation_tasks add column if not exists duration_ms integer;
alter table public.generation_tasks drop constraint if exists generation_tasks_status_check;
alter table public.generation_tasks
  add constraint generation_tasks_status_check check (status in ('queued', 'recognizing', 'generating', 'completed', 'failed'));
alter table public.generation_tasks drop constraint if exists generation_tasks_task_type_check;
alter table public.generation_tasks
  add constraint generation_tasks_task_type_check check (task_type in ('scene_image'));

create table if not exists public.scene_images (
  id text primary key default gen_random_uuid()::text,
  chapter_id text not null references public.chapters(id) on delete cascade,
  source_block_id text,
  position integer,
  image_type text check (image_type in ('scene', 'character', 'object')),
  variant text not null check (variant in ('street', 'office')),
  prompt text not null,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scene_images add column if not exists source_block_id text;
alter table public.scene_images add column if not exists position integer;
alter table public.scene_images add column if not exists image_type text;
alter table public.scene_images drop constraint if exists scene_images_image_type_check;
alter table public.scene_images
  add constraint scene_images_image_type_check check (image_type in ('scene', 'character', 'object'));

insert into storage.buckets (id, name, public)
values ('scene-images', 'scene-images', true)
on conflict (id) do update set public = excluded.public;



create table if not exists public.scene_candidates (
  id text primary key default gen_random_uuid()::text,
  task_id text not null references public.generation_tasks(id) on delete cascade,
  book_id text references public.books(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete cascade,
  candidate_order integer not null default 0,
  source_block_id text not null,
  position integer not null default 0,
  reason text not null,
  source_text text not null,
  prompt_draft text not null,
  final_prompt text,
  image_type text check (image_type in ('scene', 'character', 'object')),
  location_change text,
  confidence numeric not null default 0,
  provider text,
  model text,
  prompt_version text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scene_candidates add column if not exists task_id text references public.generation_tasks(id) on delete cascade;
alter table public.scene_candidates add column if not exists book_id text references public.books(id) on delete cascade;
alter table public.scene_candidates add column if not exists chapter_id text references public.chapters(id) on delete cascade;
alter table public.scene_candidates add column if not exists candidate_order integer not null default 0;
alter table public.scene_candidates add column if not exists source_block_id text;
alter table public.scene_candidates add column if not exists position integer not null default 0;
alter table public.scene_candidates add column if not exists reason text;
alter table public.scene_candidates add column if not exists source_text text;
alter table public.scene_candidates add column if not exists prompt_draft text;
alter table public.scene_candidates add column if not exists final_prompt text;
alter table public.scene_candidates add column if not exists image_type text;
alter table public.scene_candidates drop constraint if exists scene_candidates_image_type_check;
alter table public.scene_candidates
  add constraint scene_candidates_image_type_check check (image_type in ('scene', 'character', 'object'));
alter table public.scene_candidates add column if not exists location_change text;
alter table public.scene_candidates add column if not exists confidence numeric not null default 0;
alter table public.scene_candidates add column if not exists provider text;
alter table public.scene_candidates add column if not exists model text;
alter table public.scene_candidates add column if not exists prompt_version text;
alter table public.scene_candidates add column if not exists raw_response jsonb;

-- Expanded image-type persistence remains additive so legacy rows stay readable.
alter table public.scene_candidates add column if not exists classification_snapshot jsonb;
alter table public.scene_candidates add column if not exists classification_status text;
alter table public.scene_candidates add column if not exists contract_version text;
alter table public.scene_candidates add column if not exists profile_version text;
alter table public.scene_candidates drop constraint if exists scene_candidates_image_type_check;
alter table public.scene_candidates add constraint scene_candidates_image_type_check check (image_type in ('scene', 'character', 'environment', 'portrait', 'interaction', 'action', 'object', 'atmosphere'));
alter table public.scene_candidates drop constraint if exists scene_candidates_classification_status_check;
alter table public.scene_candidates add constraint scene_candidates_classification_status_check check (classification_status is null or classification_status in ('eligible', 'below_threshold', 'invalid'));

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
alter table public.scene_images add constraint scene_images_image_type_check check (image_type in ('scene', 'character', 'environment', 'portrait', 'interaction', 'action', 'object', 'atmosphere'));
alter table public.scene_images drop constraint if exists scene_images_candidate_projection_key;
alter table public.scene_images add constraint scene_images_candidate_projection_key unique (candidate_id);

create table if not exists public.reading_progress (
  id text primary key default gen_random_uuid()::text,
  book_id text not null references public.books(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_books_updated_at on public.books;
create trigger set_books_updated_at
before update on public.books
for each row execute function public.set_updated_at();

drop trigger if exists set_chapters_updated_at on public.chapters;
create trigger set_chapters_updated_at
before update on public.chapters
for each row execute function public.set_updated_at();

drop trigger if exists set_generation_tasks_updated_at on public.generation_tasks;
create trigger set_generation_tasks_updated_at
before update on public.generation_tasks
for each row execute function public.set_updated_at();

drop trigger if exists set_scene_images_updated_at on public.scene_images;
create trigger set_scene_images_updated_at
before update on public.scene_images
for each row execute function public.set_updated_at();


drop trigger if exists set_scene_candidates_updated_at on public.scene_candidates;
create trigger set_scene_candidates_updated_at
before update on public.scene_candidates
for each row execute function public.set_updated_at();

drop trigger if exists set_book_visual_profiles_updated_at on public.book_visual_profiles;
create trigger set_book_visual_profiles_updated_at
before update on public.book_visual_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_image_generation_attempts_updated_at on public.image_generation_attempts;
create trigger set_image_generation_attempts_updated_at
before update on public.image_generation_attempts
for each row execute function public.set_updated_at();

alter table public.books enable row level security;
alter table public.chapters enable row level security;
alter table public.generation_tasks enable row level security;
alter table public.scene_images enable row level security;
alter table public.scene_candidates enable row level security;
alter table public.reading_progress enable row level security;
alter table public.book_visual_profiles enable row level security;
alter table public.image_generation_attempts enable row level security;

-- T8 backend uses SUPABASE_SERVICE_ROLE_KEY from the server only.
-- Public client policies should be added later after auth/user ownership is designed.
