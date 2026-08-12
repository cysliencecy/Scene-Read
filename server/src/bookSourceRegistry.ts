import { randomUUID } from 'node:crypto';
import { executeSourceStage, validateBookSourceConfig, type BookSourceConfig, type BookSourceValidation } from './bookSourceEngine.js';
import { supabase, type Json } from './supabaseClient.js';

export type BookSourceVersion = {
  id: string;
  sourceId: string;
  version: number;
  name: string;
  config: BookSourceConfig;
  validation: (BookSourceValidation & { previews?: Record<string, Array<Record<string, string>>> }) | null;
  validatedAt?: string;
  enabled: boolean;
  removedAt?: string;
  createdAt: string;
};

const memoryVersions = new Map<string, BookSourceVersion>();
const keyOf = (sourceId: string, version: number) => `${sourceId}:${version}`;
const fromRow = (row: any): BookSourceVersion => ({
  id: row.id, sourceId: row.source_id, version: row.version, name: row.name,
  config: row.config as BookSourceConfig, validation: row.validation as BookSourceVersion['validation'],
  validatedAt: row.validated_at ?? undefined, enabled: row.enabled, removedAt: row.removed_at ?? undefined, createdAt: row.created_at,
});

export async function listBookSourceVersions() {
  if (!supabase) return [...memoryVersions.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId) || b.version - a.version);
  const { data, error } = await supabase.from('book_source_versions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(fromRow);
}

export async function importBookSourceConfig(input: unknown) {
  const validation = validateBookSourceConfig(input);
  if (!validation.valid) return { imported: false, validation, source: null };
  const config = input as BookSourceConfig;
  const existing = (await listBookSourceVersions()).find((item) => item.sourceId === config.sourceId && item.version === config.version);
  if (existing) {
    if (existing.removedAt) {
      const restored = { ...existing, removedAt: undefined, enabled: false };
      if (!supabase) memoryVersions.set(keyOf(existing.sourceId, existing.version), restored);
      else {
        const { error } = await supabase.from('book_source_versions').update({ removed_at: null, enabled: false }).eq('source_id', existing.sourceId).eq('version', existing.version);
        if (error) throw error;
      }
      return { imported: false, validation, source: restored };
    }
    return { imported: false, validation, source: existing };
  }
  const latest = (await listBookSourceVersions()).find((item) => item.sourceId === config.sourceId);
  if (latest && config.version <= latest.version) throw new Error('BOOK_SOURCE_VERSION_NOT_NEWER');
  const source: BookSourceVersion = {
    id: randomUUID(), sourceId: config.sourceId, version: config.version, name: config.name,
    config, validation: null, enabled: false, createdAt: new Date().toISOString(),
  };
  if (!supabase) memoryVersions.set(keyOf(source.sourceId, source.version), source);
  else {
    const { data, error } = await supabase.from('book_source_versions').insert({
      id: source.id, source_id: source.sourceId, version: source.version, name: source.name, config: config as unknown as Json,
    }).select('*').single();
    if (error) throw error;
    return { imported: true, validation, source: fromRow(data) };
  }
  return { imported: true, validation, source };
}

export async function validateBookSourceVersion(sourceId: string, version: number, variables: Record<string, string>) {
  const source = (await listBookSourceVersions()).find((item) => item.sourceId === sourceId && item.version === version && !item.removedAt);
  if (!source) throw new Error('BOOK_SOURCE_NOT_FOUND');
  const staticValidation = validateBookSourceConfig(source.config);
  const previews: Record<string, Array<Record<string, string>>> = {};
  const issues = [...staticValidation.issues];
  if (staticValidation.valid) {
    for (const stageName of ['search', 'detail', 'catalog', 'chapter'] as const) {
      try {
        previews[stageName] = await executeSourceStage(source.config, source.config[stageName], variables);
        if (previews[stageName].length === 0) issues.push({ path: stageName, code: 'PREVIEW_EMPTY', message: `${stageName} preview returned no rows.` });
      } catch (error) {
        issues.push({ path: stageName, code: error instanceof Error ? error.message : 'PREVIEW_FAILED', message: `${stageName} preview failed.` });
      }
    }
  }
  const validation = { valid: issues.length === 0, issues, previews };
  const validatedAt = new Date().toISOString();
  if (!supabase) memoryVersions.set(keyOf(sourceId, version), { ...source, validation, validatedAt });
  else {
    const { error } = await supabase.from('book_source_versions').update({ validation: validation as unknown as Json, validated_at: validatedAt }).eq('source_id', sourceId).eq('version', version);
    if (error) throw error;
  }
  return validation;
}

export async function enableBookSourceVersion(sourceId: string, version: number) {
  const versions = await listBookSourceVersions();
  const source = versions.find((item) => item.sourceId === sourceId && item.version === version && !item.removedAt);
  if (!source) throw new Error('BOOK_SOURCE_NOT_FOUND');
  if (!source.validation?.valid) throw new Error('BOOK_SOURCE_VALIDATION_REQUIRED');
  const enabledIds = new Set(versions.filter((item) => item.enabled && item.sourceId !== sourceId && !item.removedAt).map((item) => item.sourceId));
  if (enabledIds.size >= 5) throw new Error('BOOK_SOURCE_ENABLE_LIMIT_REACHED');
  if (!supabase) {
    for (const item of versions.filter((item) => item.sourceId === sourceId)) memoryVersions.set(keyOf(item.sourceId, item.version), { ...item, enabled: item.version === version });
  } else {
    const disabled = await supabase.from('book_source_versions').update({ enabled: false }).eq('source_id', sourceId);
    if (disabled.error) throw disabled.error;
    const enabled = await supabase.from('book_source_versions').update({ enabled: true }).eq('source_id', sourceId).eq('version', version);
    if (enabled.error) throw enabled.error;
  }
  return { ...source, enabled: true };
}

export async function removeBookSource(sourceId: string) {
  const now = new Date().toISOString();
  const versions = (await listBookSourceVersions()).filter((item) => item.sourceId === sourceId);
  if (versions.length === 0) throw new Error('BOOK_SOURCE_NOT_FOUND');
  if (!supabase) versions.forEach((item) => memoryVersions.set(keyOf(item.sourceId, item.version), { ...item, enabled: false, removedAt: now }));
  else {
    const { error } = await supabase.from('book_source_versions').update({ enabled: false, removed_at: now }).eq('source_id', sourceId);
    if (error) throw error;
  }
  return { removed: true, sourceId };
}
