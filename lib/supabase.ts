import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Novel, Chapter } from '@/types/novel';
import { sanitizeChapter, sanitizeChapters } from './chapter-utils';

const supabaseUrl = process.env.SUPABASE_URL || '';
// Prefer service role key on server-side if available, fallback to anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabaseClientInstance: SupabaseClient | null = null;

/**
 * Returns true if Supabase URL and Key are provided
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl && 
    supabaseUrl.trim().length > 0 && 
    !supabaseUrl.includes('your-project') &&
    supabaseKey && 
    supabaseKey.trim().length > 0 &&
    !supabaseKey.includes('your-anon-key')
  );
}

/**
 * Get or create the Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseClientInstance) {
    supabaseClientInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClientInstance;
}

/**
 * Check if the Supabase error indicates that the table hasn't been created yet
 */
export function isTableNotFoundError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('relation') ||
    msg.includes('does not exist')
  );
}

/**
 * Test connectivity to Supabase
 */
export async function validateSupabaseConnection(): Promise<{ 
  ok: boolean; 
  tableMissing?: boolean;
  message: string; 
  details?: unknown 
}> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: 'Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY trong biến môi trường (.env)',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Không thể khởi tạo Supabase Client' };
  }

  try {
    const { data, error } = await client.from('novels').select('id').limit(1);
    if (error) {
      if (isTableNotFoundError(error)) {
        return {
          ok: false,
          tableMissing: true,
          message: 'Kết nối Supabase thành công nhưng chưa tạo bảng "novels". Vui lòng chạy file supabase/schema.sql trong SQL Editor.',
          details: error,
        };
      }
      return {
        ok: false,
        message: `Lỗi kết nối Supabase: ${error.message} (${error.code || 'unknown'})`,
        details: error,
      };
    }
    return {
      ok: true,
      message: 'Kết nối Supabase thành công! Bảng novels sẵn sàng hoạt động.',
      details: data,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Lỗi kết nối mạng tới Supabase: ${msg}`,
    };
  }
}

// -------------------------------------------------------------
// Type Converters between TypeScript camelCase and PostgreSQL snake_case
// -------------------------------------------------------------

export function novelToSupabaseRow(novel: Novel) {
  return {
    id: novel.id,
    title: (novel.title || 'Truyện không tên').slice(0, 300),
    original_title: (novel.originalTitle || '').slice(0, 300),
    author: (novel.author || 'Khuyết danh').slice(0, 200),
    description: novel.description || '',
    cover_url: (novel.coverUrl || '').slice(0, 2000),
    source_url: (novel.sourceUrl || '').slice(0, 2000),
    source_domain: (novel.sourceDomain || '').slice(0, 200),
    original_language: novel.originalLanguage || 'zh',
    target_language: novel.targetLanguage || 'vi',
    status: novel.status || 'ongoing',
    chapters_count: Math.max(0, novel.chaptersCount || 0),
    translated_chapters_count: Math.max(0, novel.translatedChaptersCount || 0),
    last_read_chapter_number: Math.max(1, novel.lastReadChapterNumber || 1),
    translation_genre: novel.translationGenre || 'xianxia',
    glossary: novel.glossary || {},
    cookie_config: novel.cookieConfig || {},
    updated_at: novel.updatedAt || new Date().toISOString(),
  };
}

export function supabaseRowToNovel(row: any): Novel {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.original_title || undefined,
    author: row.author || 'Khuyết danh',
    description: row.description || '',
    coverUrl: row.cover_url || '',
    sourceUrl: row.source_url || '',
    sourceDomain: row.source_domain || '',
    originalLanguage: row.original_language || 'zh',
    targetLanguage: row.target_language || 'vi',
    status: row.status || 'ongoing',
    chaptersCount: row.chapters_count || 0,
    translatedChaptersCount: row.translated_chapters_count || 0,
    lastReadChapterNumber: row.last_read_chapter_number || 1,
    translationGenre: row.translation_genre || 'xianxia',
    glossary: row.glossary || {},
    cookieConfig: row.cookie_config || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function chapterToSupabaseRow(chapter: Chapter) {
  const clean = sanitizeChapter(chapter);
  return {
    id: clean.id,
    novel_id: clean.novelId,
    chapter_number: clean.chapterNumber,
    title: clean.title,
    translated_title: clean.translatedTitle || null,
    source_url: (clean.sourceUrl || '').slice(0, 2000),
    raw_content: clean.rawContent || '',
    translated_content: clean.translatedContent || null,
    translation_status: clean.translationStatus || 'pending',
    translation_error: clean.translationError || null,
    translated_at: clean.translatedAt || null,
    word_count: clean.wordCount || 0,
  };
}

export function supabaseRowToChapter(row: any): Chapter {
  return sanitizeChapter({
    id: row.id,
    novelId: row.novel_id,
    chapterNumber: row.chapter_number,
    title: row.title,
    translatedTitle: row.translated_title || undefined,
    sourceUrl: row.source_url || '',
    rawContent: row.raw_content || '',
    translatedContent: row.translated_content || undefined,
    translationStatus: row.translation_status || 'pending',
    translationError: row.translation_error || undefined,
    translatedAt: row.translated_at || undefined,
    wordCount: row.word_count || 0,
    createdAt: row.created_at || new Date().toISOString(),
  });
}

// -------------------------------------------------------------
// Database Operations Helper
// -------------------------------------------------------------

export async function fetchSupabaseNovels(): Promise<Novel[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('novels')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    if (isTableNotFoundError(error)) {
      // Quietly fall back to local/cached state
      return [];
    }
    console.warn('Supabase fetch novels note:', error.message);
    return [];
  }

  return (data || []).map(supabaseRowToNovel);
}

export async function saveSupabaseNovel(novel: Novel): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const row = novelToSupabaseRow(novel);
  const { error } = await client
    .from('novels')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    if (isTableNotFoundError(error)) {
      return false;
    }
    console.warn('Supabase save novel note:', error.message);
    return false;
  }
  return true;
}

export async function deleteSupabaseNovel(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    // 1. Delete all chapters of this novel first to prevent foreign key constraint conflicts
    const { error: chapError } = await client.from('chapters').delete().eq('novel_id', id);
    if (chapError && !isTableNotFoundError(chapError)) {
      console.warn('Supabase delete novel chapters notice:', chapError.message);
    }

    // 2. Delete the novel record itself
    const { error: novelError } = await client.from('novels').delete().eq('id', id);
    if (novelError) {
      if (isTableNotFoundError(novelError)) return false;
      console.warn('Supabase delete novel note:', novelError.message);
      return false;
    }
    return true;
  } catch (err: unknown) {
    console.warn('Supabase deleteSupabaseNovel exception:', err);
    return false;
  }
}

export async function fetchSupabaseChapters(novelId: string): Promise<Chapter[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('chapters')
    .select('*')
    .eq('novel_id', novelId)
    .order('chapter_number', { ascending: true });

  if (error) {
    if (isTableNotFoundError(error)) return [];
    console.warn('Supabase fetch chapters note:', error.message);
    return [];
  }

  return sanitizeChapters((data || []).map(supabaseRowToChapter));
}

export async function saveSupabaseChapters(chapters: Chapter[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || chapters.length === 0) return false;

  const rows = chapters.map(chapterToSupabaseRow);
  
  // Upsert in batches of 50 to avoid payload size limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from('chapters')
      .upsert(chunk, { onConflict: 'id' });

    if (error) {
      if (isTableNotFoundError(error)) return false;
      console.warn('Supabase save chapters batch note:', error.message);
      return false;
    }
  }

  return true;
}
