import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export type Database = {
  public: {
    Tables: {
      books: {
        Row: {
          id: string;
          title: string;
          progress: string;
          accent: string;
          current_chapter_id: string;
          last_read_label: string;
          visual_style: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          progress?: string;
          accent?: string;
          current_chapter_id: string;
          last_read_label?: string;
          visual_style?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          progress?: string;
          accent?: string;
          current_chapter_id?: string;
          last_read_label?: string;
          visual_style?: string | null;
        };
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string;
          book_id: string;
          title: string;
          progress: number;
          blocks: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          book_id: string;
          title: string;
          progress?: number;
          blocks?: unknown;
        };
        Update: {
          id?: string;
          book_id?: string;
          title?: string;
          progress?: number;
          blocks?: unknown;
        };
        Relationships: [];
      };
      generation_tasks: {
        Row: {
          id: string;
          book_id?: string | null;
          chapter_id: string;
          progress: number;
          status: 'queued' | 'recognizing' | 'generating' | 'completed' | 'failed';
          task_type?: 'scene_image' | null;
          label: string;
          error_message?: string | null;
          provider?: string | null;
          duration_ms?: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          book_id?: string | null;
          chapter_id: string;
          progress?: number;
          status?: 'queued' | 'recognizing' | 'generating' | 'completed' | 'failed';
          task_type?: 'scene_image' | null;
          label: string;
          error_message?: string | null;
          provider?: string | null;
          duration_ms?: number | null;
        };
        Update: {
          id?: string;
          book_id?: string | null;
          chapter_id?: string;
          progress?: number;
          status?: 'queued' | 'recognizing' | 'generating' | 'completed' | 'failed';
          task_type?: 'scene_image' | null;
          label?: string;
          error_message?: string | null;
          provider?: string | null;
          duration_ms?: number | null;
        };
        Relationships: [];
      };
      scene_images: {
        Row: {
          id: string;
          chapter_id: string;
          source_block_id: string | null;
          position: number | null;
          image_type: 'scene' | 'character' | 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere' | null;
          candidate_id: string | null;
          attempt_id: string | null;
          variant: 'street' | 'office';
          prompt: string;
          image_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          source_block_id?: string | null;
          position?: number | null;
          image_type?: 'scene' | 'character' | 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere' | null;
          candidate_id?: string | null;
          attempt_id?: string | null;
          variant: 'street' | 'office';
          prompt: string;
          image_path?: string | null;
        };
        Update: {
          id?: string;
          chapter_id?: string;
          source_block_id?: string | null;
          position?: number | null;
          image_type?: 'scene' | 'character' | 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere' | null;
          candidate_id?: string | null;
          attempt_id?: string | null;
          variant?: 'street' | 'office';
          prompt?: string;
          image_path?: string | null;
        };
        Relationships: [];
      };
      scene_candidates: {
        Row: {
          id: string;
          task_id: string;
          book_id: string | null;
          chapter_id: string;
          candidate_order: number;
          source_block_id: string;
          position: number;
          reason: string;
          source_text: string;
          prompt_draft: string;
          final_prompt: string | null;
          image_type: 'scene' | 'character' | 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere' | null;
          location_change: string | null;
          confidence: number;
          provider: string | null;
          model: string | null;
          prompt_version: string | null;
          raw_response: unknown;
          classification_snapshot: unknown;
          classification_status: 'eligible' | 'below_threshold' | 'invalid' | null;
          contract_version: string | null;
          profile_version: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          book_id?: string | null;
          chapter_id: string;
          candidate_order?: number;
          source_block_id: string;
          position?: number;
          reason: string;
          source_text: string;
          prompt_draft: string;
          final_prompt?: string | null;
          image_type?: 'scene' | 'character' | 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere' | null;
          location_change?: string | null;
          confidence?: number;
          provider?: string | null;
          model?: string | null;
          prompt_version?: string | null;
          raw_response?: unknown;
          classification_snapshot?: unknown;
          classification_status?: 'eligible' | 'below_threshold' | 'invalid' | null;
          contract_version?: string | null;
          profile_version?: string | null;
        };
        Update: {
          id?: string;
          task_id?: string;
          book_id?: string | null;
          chapter_id?: string;
          candidate_order?: number;
          source_block_id?: string;
          position?: number;
          reason?: string;
          source_text?: string;
          prompt_draft?: string;
          final_prompt?: string | null;
          image_type?: 'scene' | 'character' | 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere' | null;
          location_change?: string | null;
          confidence?: number;
          provider?: string | null;
          model?: string | null;
          prompt_version?: string | null;
          raw_response?: unknown;
          classification_snapshot?: unknown;
          classification_status?: 'eligible' | 'below_threshold' | 'invalid' | null;
          contract_version?: string | null;
          profile_version?: string | null;
        };
        Relationships: [];
      };
      book_visual_profiles: {
        Row: { id: string; book_id: string; entity_type: 'character' | 'location'; entity_key: string; stable_facts: unknown; flexible_facts: unknown; version: string; created_at: string; updated_at: string };
        Insert: { id?: string; book_id: string; entity_type: 'character' | 'location'; entity_key: string; stable_facts?: unknown; flexible_facts?: unknown; version: string };
        Update: { id?: string; book_id?: string; entity_type?: 'character' | 'location'; entity_key?: string; stable_facts?: unknown; flexible_facts?: unknown; version?: string };
        Relationships: [];
      };
      image_generation_attempts: {
        Row: { id: string; idempotency_key: string; candidate_id: string; task_id: string; parent_attempt_id: string | null; trigger: 'automatic' | 'manual'; requested_type: 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere'; overridden_from: 'scene' | 'character' | 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere' | null; status: 'queued' | 'generation_failed' | 'audit_failed' | 'blocked' | 'publishable'; prompt: string; provider: string | null; model: string | null; width: number | null; height: number | null; image_url: string | null; audit: unknown; classification_snapshot: unknown; contract_version: string | null; profile_version: string | null; artifact_metadata: unknown; created_at: string; updated_at: string };
        Insert: { id?: string; idempotency_key: string; candidate_id: string; task_id: string; parent_attempt_id?: string | null; trigger: 'automatic' | 'manual'; requested_type: 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere'; overridden_from?: 'scene' | 'character' | 'environment' | 'portrait' | 'interaction' | 'action' | 'object' | 'atmosphere' | null; status: 'queued' | 'generation_failed' | 'audit_failed' | 'blocked' | 'publishable'; prompt: string; provider?: string | null; model?: string | null; width?: number | null; height?: number | null; image_url?: string | null; audit?: unknown; classification_snapshot?: unknown; contract_version?: string | null; profile_version?: string | null; artifact_metadata?: unknown };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseSecretKey);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl as string, supabaseSecretKey as string, {
      auth: {
        persistSession: false,
      },
    })
  : null;
