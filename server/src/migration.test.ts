import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const migrationPath = fileURLToPath(new URL('../../supabase/migrations/20260807_expanded_image_types.sql', import.meta.url));

const legacySchema = `
  create extension if not exists pgcrypto;
  create table public.books (id text primary key, title text not null);
  create table public.chapters (id text primary key, book_id text not null references public.books(id));
  create table public.generation_tasks (id text primary key, chapter_id text not null references public.chapters(id));
  create table public.scene_candidates (
    id text primary key,
    task_id text not null references public.generation_tasks(id),
    book_id text references public.books(id),
    chapter_id text not null references public.chapters(id),
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
  create table public.scene_images (
    id text primary key,
    chapter_id text not null references public.chapters(id),
    source_block_id text,
    position integer,
    image_type text check (image_type in ('scene', 'character', 'object')),
    variant text not null check (variant in ('street', 'office')),
    prompt text not null,
    image_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create or replace function public.set_updated_at() returns trigger as $$
  begin new.updated_at = now(); return new; end;
  $$ language plpgsql;
`;

test('expanded image types migration preserves legacy rows and enforces new attempt/projection constraints', async () => {
  const database = await PGlite.create({ extensions: { pgcrypto } });
  try {
    await database.exec(legacySchema);
    await database.exec(`
      insert into public.books (id, title) values ('book-1', 'Legacy book');
      insert into public.chapters (id, book_id) values ('chapter-1', 'book-1');
      insert into public.generation_tasks (id, chapter_id) values ('task-1', 'chapter-1');
      insert into public.scene_candidates (id, task_id, book_id, chapter_id, source_block_id, reason, source_text, prompt_draft, image_type)
      values ('candidate-1', 'task-1', 'book-1', 'chapter-1', 'block-1', 'legacy', 'Legacy source', 'Legacy prompt', 'scene');
      insert into public.scene_images (id, chapter_id, image_type, variant, prompt) values
        ('legacy-scene', 'chapter-1', 'scene', 'street', 'legacy scene'),
        ('legacy-character', 'chapter-1', 'character', 'street', 'legacy character'),
        ('legacy-object', 'chapter-1', 'object', 'street', 'legacy object');
    `);

    await database.exec(await readFile(migrationPath, 'utf8'));

    const legacyRows = await database.query<{ id: string; image_type: string; candidate_id: string | null; attempt_id: string | null }>(
      'select id, image_type, candidate_id, attempt_id from public.scene_images order by id',
    );
    assert.deepEqual(legacyRows.rows, [
      { id: 'legacy-character', image_type: 'character', candidate_id: null, attempt_id: null },
      { id: 'legacy-object', image_type: 'object', candidate_id: null, attempt_id: null },
      { id: 'legacy-scene', image_type: 'scene', candidate_id: null, attempt_id: null },
    ]);

    await database.exec(`
      insert into public.image_generation_attempts
        (id, idempotency_key, candidate_id, task_id, trigger, requested_type, status, prompt)
      values ('attempt-1', 'attempt-key-1', 'candidate-1', 'task-1', 'automatic', 'environment', 'publishable', 'published');
      update public.scene_images set candidate_id = 'candidate-1', attempt_id = 'attempt-1' where id = 'legacy-scene';
    `);
    await assert.rejects(database.exec(`
      insert into public.image_generation_attempts
        (id, idempotency_key, candidate_id, task_id, trigger, requested_type, status, prompt)
      values ('attempt-2', 'attempt-key-1', 'candidate-1', 'task-1', 'automatic', 'environment', 'publishable', 'duplicate');
    `));
    await assert.rejects(database.exec(`
      insert into public.image_generation_attempts
        (id, idempotency_key, candidate_id, task_id, trigger, requested_type, status, prompt)
      values ('attempt-legacy-type', 'attempt-key-legacy-type', 'candidate-1', 'task-1', 'automatic', 'scene', 'publishable', 'invalid type');
    `));
    await assert.rejects(database.exec(`
      insert into public.scene_images (id, chapter_id, candidate_id, attempt_id, image_type, variant, prompt)
      values ('duplicate-projection', 'chapter-1', 'candidate-1', 'attempt-1', 'environment', 'street', 'duplicate projection');
    `));
  } finally {
    await database.close();
  }
});
