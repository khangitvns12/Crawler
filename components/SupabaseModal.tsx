'use client';

import React, { useState, useEffect } from 'react';
import { safeFetchJson } from '@/lib/safe-json';
import { 
  X, Database, CheckCircle2, AlertCircle, Copy, Check, 
  Terminal, ArrowRight, RefreshCw, Sparkles, ExternalLink, Code
} from 'lucide-react';

interface SupabaseModalProps {
  onClose: () => void;
}

export default function SupabaseModal({ onClose }: SupabaseModalProps) {
  const [activeTab, setActiveTab] = useState<'guide' | 'cli' | 'sql'>('guide');
  const [statusData, setStatusData] = useState<{
    configured: boolean;
    ok: boolean;
    tableMissing?: boolean;
    message: string;
    stats?: { localNovelsCount: number; remoteNovelsCount: number; remoteChaptersCount: number };
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchStatus = () => {
    setIsLoading(true);
    safeFetchJson<any>('/api/supabase/status')
      .then(({ ok, data, error }) => {
        if (ok && data) {
          setStatusData(data);
        } else {
          setStatusData({
            configured: false,
            ok: false,
            message: error || 'Không thể kết nối đến API server',
          });
        }
      })
      .catch(() => {
        setStatusData({
          configured: false,
          ok: false,
          message: 'Không thể kết nối đến API server',
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    let isMounted = true;
    safeFetchJson<any>('/api/supabase/status')
      .then(({ ok, data, error }) => {
        if (isMounted) {
          if (ok && data) {
            setStatusData(data);
          } else {
            setStatusData({
              configured: false,
              ok: false,
              message: error || 'Không thể kết nối đến API server',
            });
          }
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setStatusData({
            configured: false,
            ok: false,
            message: 'Không thể kết nối đến API server',
          });
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleMigrate = async () => {
    setIsMigrating(true);
    setMigrateResult(null);
    try {
      const { ok, data, error } = await safeFetchJson<any>('/api/supabase/migrate', { method: 'POST' });
      if (ok && data) {
        setMigrateResult(`✓ ${data.message}`);
        fetchStatus();
      } else {
        setMigrateResult(`✗ Lỗi: ${error || data?.error || 'Di chuyển thất bại'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMigrateResult(`✗ Lỗi: ${msg}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const sqlSchema = `-- ====================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR STORY SCRAPER & AI TRANSLATION HUB
-- ====================================================================

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

CREATE INDEX IF NOT EXISTS idx_novels_updated_at ON public.novels (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_novel_lookup ON public.chapters (novel_id, chapter_number ASC);

ALTER TABLE public.novels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public select novels" ON public.novels FOR SELECT USING (true);
CREATE POLICY "Public insert/update novels" ON public.novels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public select chapters" ON public.chapters FOR SELECT USING (true);
CREATE POLICY "Public insert/update chapters" ON public.chapters FOR ALL USING (true) WITH CHECK (true);`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Chuyển đổi sang Supabase (PostgreSQL)</h2>
                <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5">
                  CLI + SQL Schema
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Lưu trữ quan hệ PostgreSQL tốc độ cao, hoàn toàn miễn phí & mở rộng dễ dàng
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Bar */}
        <div className="bg-slate-950 px-5 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Trạng thái kết nối:</span>
            {isLoading ? (
              <span className="flex items-center gap-1.5 text-slate-400">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang kiểm tra...
              </span>
            ) : statusData?.ok ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Đã kết nối thành công ({statusData.stats?.remoteNovelsCount ?? 0} truyện trên Supabase)
              </span>
            ) : statusData?.tableMissing ? (
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                <AlertCircle className="h-3.5 w-3.5" />
                Đã kết nối URL & Key! Cần chạy SQL Schema để tạo bảng novels
              </span>
            ) : statusData?.configured ? (
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                <AlertCircle className="h-3.5 w-3.5" />
                Kiểm tra lại cấu hình Supabase
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-400 font-semibold bg-slate-800 px-2.5 py-0.5 rounded-full">
                Chưa cấu hình .env (Đang chạy Local/Firestore)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatus}
              disabled={isLoading}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-200"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              Kiểm tra lại
            </button>

            {statusData?.ok && (
              <button
                onClick={handleMigrate}
                disabled={isMigrating}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 active:scale-95 disabled:opacity-50 transition-all"
              >
                <Sparkles className="h-3 w-3" />
                <span>{isMigrating ? 'Đang tải lên...' : 'Sync Local lên Supabase'}</span>
              </button>
            )}
          </div>
        </div>

        {migrateResult && (
          <div className="bg-emerald-950/40 border-b border-emerald-500/20 px-5 py-2 text-xs text-emerald-300">
            {migrateResult}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/90 px-5">
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-semibold transition-all ${
              activeTab === 'guide'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>1. Hướng dẫn kết nối Supabase</span>
          </button>
          <button
            onClick={() => setActiveTab('cli')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-semibold transition-all ${
              activeTab === 'cli'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>2. Bộ công cụ Supabase CLI</span>
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-semibold transition-all ${
              activeTab === 'sql'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="h-4 w-4" />
            <span>3. File SQL Schema (Copy & Run)</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 text-xs text-slate-300 space-y-4 scrollbar-thin">
          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">1</span>
                  <span>Tạo Project trên Supabase</span>
                </div>
                <p className="text-slate-400">
                  Truy cập trang quản trị Supabase và khởi tạo một dự án PostgreSQL hoàn toàn miễn phí.
                </p>
                <a
                  href="https://supabase.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30"
                >
                  <span>Mở Supabase.com</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">2</span>
                  <span>Lấy URL và API Key trong Supabase</span>
                </div>
                <p className="text-slate-400">
                  Vào <strong>Project Settings</strong> (biểu tượng bánh răng) $\rightarrow$ <strong>API</strong> (Data API):
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  <li><strong>Project URL</strong>: có dạng <code>https://abcdefghijklmn.supabase.co</code></li>
                  <li><strong>Project API Keys</strong>: sao chép key <code>anon</code> (public) hoặc <code>service_role</code></li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">3</span>
                    <span>Cấu hình file .env</span>
                  </div>
                  <button
                    onClick={() => handleCopy(`SUPABASE_URL="https://your-project.supabase.co"\nSUPABASE_ANON_KEY="your-anon-key"`, 'env')}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                  >
                    {copiedKey === 'env' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedKey === 'env' ? 'Đã sao chép' : 'Sao chép mẫu'}</span>
                  </button>
                </div>
                <div className="rounded-lg bg-black/60 p-3 font-mono text-[11px] text-emerald-300 border border-slate-800">
                  {`SUPABASE_URL="https://your-project.supabase.co"`}<br />
                  {`SUPABASE_ANON_KEY="your-anon-key"`}<br />
                  {`SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"`} <span className="text-slate-500"># Tuỳ chọn</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs">4</span>
                  <span>Chạy SQL Schema để khởi tạo các bảng</span>
                </div>
                <p className="text-slate-400">
                  Mở <strong>SQL Editor</strong> trong Supabase Dashboard, chuyển sang tab <strong>&quot;3. File SQL Schema&quot;</strong> bên trên, bấm nút Sao chép và dán vào Supabase để tạo 2 bảng <code>novels</code> và <code>chapters</code>.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'cli' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  <span>Cách sử dụng Supabase CLI</span>
                </h3>
                <p className="text-slate-400 text-xs">
                  Dự án đã tích hợp sẵn CLI chuyên dụng tại <code>scripts/supabase-cli.ts</code>. Bạn có thể chạy trực tiếp từ Terminal:
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-200">1. Kiểm tra kết nối tới Supabase:</span>
                    <button
                      onClick={() => handleCopy('npm run supabase:cli -- test', 'c1')}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      {copiedKey === 'c1' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  <pre className="rounded bg-black/50 p-2 font-mono text-[11px] text-emerald-300">
npm run supabase:cli -- test
                  </pre>
                  <p className="mt-1 text-[11px] text-slate-400">Kiểm tra URL, API Key, độ trễ Ping và xem bảng novels/chapters đã được tạo chưa.</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-200">2. Di chuyển dữ liệu truyện đã cào lên Supabase:</span>
                    <button
                      onClick={() => handleCopy('npm run supabase:cli -- migrate', 'c2')}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      {copiedKey === 'c2' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  <pre className="rounded bg-black/50 p-2 font-mono text-[11px] text-emerald-300">
npm run supabase:cli -- migrate
                  </pre>
                  <p className="mt-1 text-[11px] text-slate-400">Tự động đọc toàn bộ tiểu thuyết và chương từ local storage và đẩy lên Supabase PostgreSQL.</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-200">3. Xem thống kê dữ liệu trên Supabase:</span>
                    <button
                      onClick={() => handleCopy('npm run supabase:cli -- status', 'c3')}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      {copiedKey === 'c3' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  <pre className="rounded bg-black/50 p-2 font-mono text-[11px] text-emerald-300">
npm run supabase:cli -- status
                  </pre>
                  <p className="mt-1 text-[11px] text-slate-400">Hiển thị tổng số bộ truyện, tổng số chương và số chương đã được dịch thuật.</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-200">4. Liệt kê danh sách truyện trong Supabase:</span>
                    <button
                      onClick={() => handleCopy('npm run supabase:cli -- list', 'c4')}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      {copiedKey === 'c4' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  <pre className="rounded bg-black/50 p-2 font-mono text-[11px] text-emerald-300">
npm run supabase:cli -- list
                  </pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">File: <code>supabase/schema.sql</code></span>
                <button
                  onClick={() => handleCopy(sqlSchema, 'sql-file')}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  {copiedKey === 'sql-file' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedKey === 'sql-file' ? 'Đã sao chép toàn bộ SQL' : 'Sao chép toàn bộ mã SQL'}</span>
                </button>
              </div>

              <pre className="rounded-xl bg-black/70 p-4 font-mono text-[11px] leading-relaxed text-slate-200 border border-slate-800 max-h-96 overflow-y-auto scrollbar-thin">
                {sqlSchema}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 bg-slate-950 p-4 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Hệ thống hỗ trợ song song: <strong>Supabase</strong> (ưu tiên khi có .env) và <strong>Firestore / Local JSON</strong>.
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
