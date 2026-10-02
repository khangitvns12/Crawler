-- ====================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR STORY SCRAPER & AI TRANSLATION HUB
-- ====================================================================
-- Chạy script này trong Supabase Dashboard -> SQL Editor -> New query
-- ====================================================================

-- 1. Bảng Novels (Tiểu thuyết)
CREATE TABLE IF NOT EXISTS public.novels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_title TEXT DEFAULT '',
  author TEXT NOT NULL DEFAULT 'Khuyết danh',
  description TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  source_domain TEXT DEFAULT '',
  original_language TEXT NOT NULL DEFAULT 'zh',
  target_language TEXT NOT NULL DEFAULT 'vi',
  status TEXT NOT NULL DEFAULT 'ongoing',
  chapters_count INTEGER NOT NULL DEFAULT 0,
  translated_chapters_count INTEGER NOT NULL DEFAULT 0,
  last_read_chapter_number INTEGER NOT NULL DEFAULT 1,
  translation_genre TEXT NOT NULL DEFAULT 'xianxia',
  glossary JSONB NOT NULL DEFAULT '{}'::jsonb,
  cookie_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Bảng Chapters (Chương truyện)
CREATE TABLE IF NOT EXISTS public.chapters (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL REFERENCES public.novels(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  translated_title TEXT,
  source_url TEXT DEFAULT '',
  raw_content TEXT DEFAULT '',
  translated_content TEXT DEFAULT '',
  translation_status TEXT NOT NULL DEFAULT 'pending',
  translation_error TEXT,
  translated_at TIMESTAMPTZ,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Tạo Indexes tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_novels_updated_at ON public.novels (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_novel_lookup ON public.chapters (novel_id, chapter_number ASC);
CREATE INDEX IF NOT EXISTS idx_chapters_status ON public.chapters (novel_id, translation_status);

-- 4. Bật Row Level Security (RLS)
ALTER TABLE public.novels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- 5. Tạo Policies cho phép client (anon key) và backend (service role) đọc/ghi
DROP POLICY IF EXISTS "Public select novels" ON public.novels;
CREATE POLICY "Public select novels" ON public.novels FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert/update novels" ON public.novels;
CREATE POLICY "Public insert/update novels" ON public.novels FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select chapters" ON public.chapters;
CREATE POLICY "Public select chapters" ON public.chapters FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert/update chapters" ON public.chapters;
CREATE POLICY "Public insert/update chapters" ON public.chapters FOR ALL USING (true) WITH CHECK (true);

-- 6. Tự động cập nhật `updated_at` khi sửa novel
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_novels_updated_at ON public.novels;
CREATE TRIGGER trigger_novels_updated_at
BEFORE UPDATE ON public.novels
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7. Kích hoạt Supabase Realtime cho bảng novels và chapters
-- (Cập nhật thời gian thực ngay lập tức khi thêm, sửa, xoá, hoặc cào truyện)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'novels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.novels;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chapters'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chapters;
  END IF;
END $$;

-- Thiết lập REPLICA IDENTITY FULL để payload Realtime mang đầy đủ thông tin khi xóa và cập nhật
ALTER TABLE public.novels REPLICA IDENTITY FULL;
ALTER TABLE public.chapters REPLICA IDENTITY FULL;
