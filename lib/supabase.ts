import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Novel, Chapter, GeminiApiKey } from '@/types/novel';
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
// Gemini API Keys Converters
// -------------------------------------------------------------

export function geminiKeyToSupabaseRow(k: GeminiApiKey) {
  return {
    id: k.id,
    key: k.key.trim(),
    label: (k.label || 'API Key').slice(0, 100),
    is_active: k.isActive !== undefined ? k.isActive : true,
    status: k.status || 'untested',
    last_tested_at: k.lastTestedAt || null,
    error_message: k.errorMessage ? k.errorMessage.slice(0, 1000) : null,
    updated_at: new Date().toISOString(),
  };
}

export function supabaseRowToGeminiKey(row: any): GeminiApiKey {
  return {
    id: row.id,
    key: row.key,
    label: row.label || 'API Key',
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    status: row.status || 'untested',
    lastTestedAt: row.last_tested_at || undefined,
    errorMessage: row.error_message || undefined,
  };
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

  // Filter out internal system rows like '__system_gemini_keys'
  return (data || [])
    .filter((row: any) => !row.id.startsWith('__system_'))
    .map(supabaseRowToNovel);
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
  if (id.startsWith('__system_')) return false;
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

/**
 * Fetch all chapters of a novel from Supabase using chunked range pagination
 * Overcomes PostgREST's default 1000-row limit, supporting up to 10,000+ chapters!
 */
export async function fetchSupabaseChapters(novelId: string): Promise<Chapter[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const CHUNK_SIZE = 1000;
  let allChapters: Chapter[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await client
      .from('chapters')
      .select('*')
      .eq('novel_id', novelId)
      .order('chapter_number', { ascending: true })
      .range(from, from + CHUNK_SIZE - 1);

    if (error) {
      if (isTableNotFoundError(error)) return [];
      console.warn('Supabase fetch chapters note:', error.message);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      allChapters.push(supabaseRowToChapter(row));
    }

    if (data.length < CHUNK_SIZE) {
      hasMore = false;
    } else {
      from += CHUNK_SIZE;
      // Safety limit up to 50,000 chapters
      if (from >= 50000) {
        hasMore = false;
      }
    }
  }

  return sanitizeChapters(allChapters);
}

/**
 * Fetch lightweight chapter metadata headers (without heavy raw/translated contents)
 * Optimized for table of contents, progress tracking and chapter navigation in 10,000-chapter novels
 */
export async function fetchSupabaseChapterHeaders(novelId: string): Promise<Chapter[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const CHUNK_SIZE = 1000;
  let allChapters: Chapter[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await client
      .from('chapters')
      .select('id, novel_id, chapter_number, title, translated_title, source_url, translation_status, translation_error, translated_at, word_count, created_at')
      .eq('novel_id', novelId)
      .order('chapter_number', { ascending: true })
      .range(from, from + CHUNK_SIZE - 1);

    if (error) {
      if (isTableNotFoundError(error)) return [];
      console.warn('Supabase fetch chapter headers note:', error.message);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      allChapters.push(supabaseRowToChapter(row));
    }

    if (data.length < CHUNK_SIZE) {
      hasMore = false;
    } else {
      from += CHUNK_SIZE;
      if (from >= 50000) {
        hasMore = false;
      }
    }
  }

  return sanitizeChapters(allChapters);
}

/**
 * Fetch a single chapter with full text content
 */
export async function fetchSupabaseChapter(novelId: string, chapterNumber: number): Promise<Chapter | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('chapters')
      .select('*')
      .eq('novel_id', novelId)
      .eq('chapter_number', chapterNumber)
      .maybeSingle();

    if (error || !data) return null;
    return supabaseRowToChapter(data);
  } catch {
    return null;
  }
}

export async function saveSupabaseChapters(chapters: Chapter[], novelFallback?: Novel): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || chapters.length === 0) return false;

  const novelId = chapters[0].novelId;

  // 1. If novelFallback is provided, ensure novel is upserted in Supabase first
  // to prevent foreign key constraint violations (chapters_novel_id_fkey)
  if (novelFallback) {
    try {
      await saveSupabaseNovel(novelFallback);
    } catch {
      // Non-fatal fallback
    }
  }

  const rows = chapters.map(chapterToSupabaseRow);
  
  // Upsert in batches of 100 for high efficiency with large chapter collections
  const BATCH_SIZE = 100;
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

  // 2. Automatically update novel chapter count, translated count, and updated_at in Supabase
  try {
    const { count } = await client
      .from('chapters')
      .select('*', { count: 'exact', head: true })
      .eq('novel_id', novelId);

    const { count: transCount } = await client
      .from('chapters')
      .select('*', { count: 'exact', head: true })
      .eq('novel_id', novelId)
      .eq('translation_status', 'translated');

    if (typeof count === 'number' && count > 0) {
      await client
        .from('novels')
        .update({
          chapters_count: count,
          translated_chapters_count: typeof transCount === 'number' ? transCount : 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', novelId);
    }
  } catch {
    // Non-fatal
  }

  return true;
}

export async function saveSupabaseChapter(chapter: Chapter, novelFallback?: Novel): Promise<boolean> {
  return saveSupabaseChapters([chapter], novelFallback);
}

/**
 * Delete a single chapter from Supabase and update novel chapter counts
 */
export async function deleteSupabaseChapter(novelId: string, chapterNumber: number): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('chapters')
      .delete()
      .eq('novel_id', novelId)
      .eq('chapter_number', chapterNumber);

    if (error) {
      if (isTableNotFoundError(error)) return false;
      console.warn('Supabase delete chapter note:', error.message);
      return false;
    }

    // Refresh novel chapter counts after deletion
    try {
      const { count } = await client
        .from('chapters')
        .select('*', { count: 'exact', head: true })
        .eq('novel_id', novelId);

      const { count: transCount } = await client
        .from('chapters')
        .select('*', { count: 'exact', head: true })
        .eq('novel_id', novelId)
        .eq('translation_status', 'translated');

      await client
        .from('novels')
        .update({
          chapters_count: typeof count === 'number' ? count : 0,
          translated_chapters_count: typeof transCount === 'number' ? transCount : 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', novelId);
    } catch {
      // Non-fatal
    }

    return true;
  } catch (err) {
    console.warn('deleteSupabaseChapter exception:', err);
    return false;
  }
}

/**
 * Delete multiple chapters from Supabase
 */
export async function deleteSupabaseChapters(novelId: string, chapterNumbers: number[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || chapterNumbers.length === 0) return false;

  try {
    const { error } = await client
      .from('chapters')
      .delete()
      .eq('novel_id', novelId)
      .in('chapter_number', chapterNumbers);

    if (error) {
      if (isTableNotFoundError(error)) return false;
      console.warn('Supabase delete chapters note:', error.message);
      return false;
    }

    // Refresh novel chapter counts
    try {
      const { count } = await client
        .from('chapters')
        .select('*', { count: 'exact', head: true })
        .eq('novel_id', novelId);

      const { count: transCount } = await client
        .from('chapters')
        .select('*', { count: 'exact', head: true })
        .eq('novel_id', novelId)
        .eq('translation_status', 'translated');

      await client
        .from('novels')
        .update({
          chapters_count: typeof count === 'number' ? count : 0,
          translated_chapters_count: typeof transCount === 'number' ? transCount : 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', novelId);
    } catch {
      // Non-fatal
    }

    return true;
  } catch (err) {
    console.warn('deleteSupabaseChapters exception:', err);
    return false;
  }
}

// -------------------------------------------------------------
// Gemini API Keys Storage on Supabase
// -------------------------------------------------------------

/**
 * Fetch all configured Gemini API keys from Supabase
 * If gemini_api_keys table has not yet been migrated, falls back to internal system row
 */
export async function fetchSupabaseApiKeys(): Promise<GeminiApiKey[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('gemini_api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data.map(supabaseRowToGeminiKey);
    }

    // Fallback if table does not exist: retrieve from novels system row
    if (error && isTableNotFoundError(error)) {
      const { data: sysRow } = await client
        .from('novels')
        .select('cookie_config')
        .eq('id', '__system_gemini_keys')
        .maybeSingle();

      if (sysRow?.cookie_config?.keys && Array.isArray(sysRow.cookie_config.keys)) {
        return sysRow.cookie_config.keys as GeminiApiKey[];
      }
    }
  } catch (err) {
    console.warn('fetchSupabaseApiKeys notice:', err);
  }

  return [];
}

/**
 * Save / Upsert Gemini API keys to Supabase
 * Handles both the dedicated gemini_api_keys table and the resilient system backup row
 */
export async function saveSupabaseApiKeys(apiKeys: GeminiApiKey[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || apiKeys.length === 0) return false;

  try {
    const rows = apiKeys.map(geminiKeyToSupabaseRow);
    const { error } = await client
      .from('gemini_api_keys')
      .upsert(rows, { onConflict: 'id' });

    if (!error) {
      return true;
    }

    // If dedicated table is missing, store safely in system backup row
    if (isTableNotFoundError(error)) {
      const existing = await fetchSupabaseApiKeys();
      const map = new Map<string, GeminiApiKey>();
      existing.forEach(k => map.set(k.id, k));
      apiKeys.forEach(k => map.set(k.id, k));
      const merged = Array.from(map.values());

      await client.from('novels').upsert({
        id: '__system_gemini_keys',
        title: '__system_gemini_keys__',
        original_title: '',
        author: 'System',
        description: 'System-managed Gemini API keys backup row',
        cover_url: '',
        source_url: '',
        source_domain: 'system',
        original_language: 'zh',
        target_language: 'vi',
        status: 'ongoing',
        chapters_count: 0,
        translated_chapters_count: 0,
        last_read_chapter_number: 1,
        translation_genre: 'general',
        glossary: {},
        cookie_config: { keys: merged },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      return true;
    }

    console.warn('saveSupabaseApiKeys notice:', error.message);
  } catch (err) {
    console.warn('saveSupabaseApiKeys exception:', err);
  }

  return false;
}

export async function saveSupabaseApiKey(apiKey: GeminiApiKey): Promise<boolean> {
  return saveSupabaseApiKeys([apiKey]);
}

/**
 * Delete a Gemini API key from Supabase
 */
export async function deleteSupabaseApiKey(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from('gemini_api_keys').delete().eq('id', id);
    if (!error) return true;

    if (isTableNotFoundError(error)) {
      const existing = await fetchSupabaseApiKeys();
      const filtered = existing.filter(k => k.id !== id);
      await client.from('novels').upsert({
        id: '__system_gemini_keys',
        title: '__system_gemini_keys__',
        original_title: '',
        author: 'System',
        description: 'System-managed Gemini API keys backup row',
        cover_url: '',
        source_url: '',
        source_domain: 'system',
        original_language: 'zh',
        target_language: 'vi',
        status: 'ongoing',
        chapters_count: 0,
        translated_chapters_count: 0,
        last_read_chapter_number: 1,
        translation_genre: 'general',
        glossary: {},
        cookie_config: { keys: filtered },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      return true;
    }
  } catch (err) {
    console.warn('deleteSupabaseApiKey exception:', err);
  }

  return false;
}

/**
 * Retrieve active, valid Gemini API key strings from Supabase for translation requests
 */
export async function fetchActiveSupabaseApiKeyStrings(): Promise<string[]> {
  const keys = await fetchSupabaseApiKeys();
  return keys
    .filter(k => k.isActive && k.status !== 'invalid')
    .map(k => k.key.trim())
    .filter(Boolean);
}


