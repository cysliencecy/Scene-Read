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
          chapter_id: string;
          progress: number;
          status: 'queued' | 'generating' | 'completed';
          label: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          progress?: number;
          status?: 'queued' | 'generating' | 'completed';
          label: string;
        };
        Update: {
          id?: string;
          chapter_id?: string;
          progress?: number;
          status?: 'queued' | 'generating' | 'completed';
          label?: string;
        };
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
