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
  chapter_id text not null references public.chapters(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  status text not null default 'queued' check (status in ('queued', 'generating', 'completed')),
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scene_images (
  id text primary key default gen_random_uuid()::text,
  chapter_id text not null references public.chapters(id) on delete cascade,
  variant text not null check (variant in ('street', 'office')),
  prompt text not null,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

alter table public.books enable row level security;
alter table public.chapters enable row level security;
alter table public.generation_tasks enable row level security;
alter table public.scene_images enable row level security;
alter table public.reading_progress enable row level security;

-- T8 backend uses SUPABASE_SERVICE_ROLE_KEY from the server only.
-- Public client policies should be added later after auth/user ownership is designed.
