'use client';

import React, { useState } from 'react';
import { Chapter, CookieConfig, CrawlerConfig, TranslationGenre } from '@/types/novel';
import { safeFetchJson } from '@/lib/safe-json';
import { 
  X, Globe, Sparkles, RefreshCw, CheckCircle2, AlertCircle, 
  Database, Hash, ArrowRight 
} from 'lucide-react';

interface CrawlSingleChapterModalProps {
  novelId: string;
  novelTitle: string;
  defaultChapterNumber?: number;
  cookieConfig?: CookieConfig;
  crawlerConfig?: CrawlerConfig;
  translationGenre?: TranslationGenre;
  onClose: () => void;
  onChapterAdded: (newChapter: Chapter) => void;
}

export default function CrawlSingleChapterModal({
  novelId,
  novelTitle,
  defaultChapterNumber = 1,
  cookieConfig,
  crawlerConfig,
  translationGenre = 'general',
  onClose,
  onChapterAdded,
}: CrawlSingleChapterModalProps) {
  const [chapterUrl, setChapterUrl] = useState('');
  const [chapterNumber, setChapterNumber] = useState<number>(defaultChapterNumber);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [genre, setGenre] = useState<TranslationGenre>(translationGenre);

  const [isCrawling, setIsCrawling] = useState(false);
  const [statusStep, setStatusStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successChapter, setSuccessChapter] = useState<Chapter | null>(null);

  const handleCrawlSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapterUrl.trim() || !chapterUrl.trim().startsWith('http')) {
      setErrorMsg('Vui lòng nhập đường link hợp lệ của chương truyện (bắt đầu bằng http:// hoặc https://).');
      return;
    }

    setIsCrawling(true);
    setErrorMsg(null);
    setSuccessChapter(null);
    setStatusStep('Đang kết nối & bóc tách văn bản từ link...');

    try {
      const { ok, data, error } = await safeFetchJson<any>(`/api/novels/${novelId}/chapters/crawl-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterUrl: chapterUrl.trim(),
          chapterNumber,
          autoTranslate,
          genre,
          cookieConfig,
          crawlerConfig,
        }),
      });

      if (!ok || !data?.success) {
        throw new Error(error || data?.error || 'Không thể cào chương này');
      }

      const createdChapter = data.data as Chapter;
      setSuccessChapter(createdChapter);
      setStatusStep('✓ Cào thành công và đã lưu trực tiếp vào cơ sở dữ liệu Supabase!');
      onChapterAdded(createdChapter);

      // Auto-increment chapter number for convenience if user wants to crawl next chapter
      setChapterNumber(prev => prev + 1);
      setChapterUrl('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStatusStep('');
    } finally {
      setIsCrawling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Cào từng chương theo liên kết</h3>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  Supabase
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-sm">
                Thêm chương mới vào truyện: <b className="text-slate-200">{novelTitle}</b>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleCrawlSingle} className="p-6 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successChapter && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>{statusStep || 'Đã cào & lưu thành công!'}</span>
              </div>
              <div className="text-[11px] text-emerald-400/90 pl-6 space-y-0.5">
                <p>• <b>Số chương:</b> Chương {successChapter.chapterNumber}</p>
                <p>• <b>Tiêu đề:</b> {successChapter.translatedTitle || successChapter.title}</p>
                <p>• <b>Số từ:</b> {successChapter.wordCount} từ • Trạng thái: {successChapter.translationStatus === 'translated' ? 'Đã dịch AI' : 'Chưa dịch'}</p>
              </div>
            </div>
          )}

          {/* Chapter URL Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Đường link của chương cần cào (URL):
            </label>
            <input
              type="url"
              value={chapterUrl}
              onChange={e => setChapterUrl(e.target.value)}
              placeholder="Ví dụ: https://www.xbiquge.info/135/135260/258618.html hoặc 69shuba, truyenfull..."
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Hỗ trợ tự động bóc tách chuẩn xác mọi trang web (xbiquge, 69shuba, truyenfull, syosetu...).
            </p>
          </div>

          {/* Chapter Number and Auto-Translate Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Hash className="h-3 w-3 text-amber-400" /> Số thứ tự chương:
              </label>
              <input
                type="number"
                min={1}
                value={chapterNumber}
                onChange={e => setChapterNumber(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500">Mặc định: Tiếp nối chương hiện tại</span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Văn phong dịch AI:
              </label>
              <select
                value={genre}
                onChange={e => setGenre(e.target.value as TranslationGenre)}
                disabled={!autoTranslate}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none disabled:opacity-40"
              >
                <option value="xianxia">🇨🇳 Tiên Hiệp / Kiếm Hiệp</option>
                <option value="modern">🏙️ Đô Thị / Ngôn Tình</option>
                <option value="lightnovel">🇯🇵 Light Novel Nhật</option>
                <option value="webnovel">⚔️ Webnovel Tây Phương</option>
                <option value="general">📖 Văn Học Tiêu Chuẩn</option>
              </select>
            </div>
          </div>

          {/* Auto Translate Toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <input
              type="checkbox"
              checked={autoTranslate}
              onChange={e => setAutoTranslate(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0"
            />
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200">
                Tự động dịch tiêu đề & nội dung sang Tiếng Việt bằng Gemini AI
              </span>
            </div>
          </label>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            >
              Đóng
            </button>

            <button
              type="submit"
              disabled={isCrawling}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isCrawling ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>{statusStep || 'Đang cào & lưu...'}</span>
                </>
              ) : (
                <>
                  <span>Cào & Lưu vào Supabase</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
