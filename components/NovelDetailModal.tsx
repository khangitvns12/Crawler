'use client';

import React, { useState, useEffect } from 'react';
import { Novel, Chapter } from '@/types/novel';
import { cleanChapterTitle, formatChapterDisplayTitle } from '@/lib/chapter-utils';
import { safeFetchJson } from '@/lib/safe-json';
import { 
  X, BookOpen, Download, Sparkles, Trash2, Edit3, 
  CheckCircle2, Clock, Save, RefreshCw, ExternalLink
} from 'lucide-react';

interface NovelDetailModalProps {
  novel: Novel;
  onClose: () => void;
  onUpdateNovel: (updated: Novel) => void;
  onReadChapter: (novel: Novel, chapterNum: number) => void;
  onTranslateNovel: (novel: Novel) => void;
  onResumeCrawl?: (novel: Novel) => void;
  onOpenEpub: (novel: Novel) => void;
  onDeleteNovel: (id: string) => void;
}

export default function NovelDetailModal({
  novel,
  onClose,
  onUpdateNovel,
  onReadChapter,
  onTranslateNovel,
  onResumeCrawl,
  onOpenEpub,
  onDeleteNovel,
}: NovelDetailModalProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(true);

  // Check update state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ webCount: number; newCount: number } | null>(null);

  // Edit mode
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [title, setTitle] = useState(novel.title);
  const [author, setAuthor] = useState(novel.author);
  const [description, setDescription] = useState(novel.description);
  const [coverUrl, setCoverUrl] = useState(novel.coverUrl);
  const [isSaving, setIsSaving] = useState(false);

  const handleCheckWebUpdate = async () => {
    if (!novel.sourceUrl) return;
    setIsCheckingUpdate(true);
    setUpdateResult(null);
    try {
      const { ok, data } = await safeFetchJson<any>('/api/crawler/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: novel.sourceUrl,
          cookieConfig: novel.cookieConfig,
          crawlerConfig: novel.crawlerConfig,
          fetchAllPages: true,
          maxPages: 150,
        }),
      });
      if (ok && data?.data && Array.isArray(data.data.chapters)) {
        const webCount = data.data.chapters.length;
        const currentCount = novel.chaptersCount || chapters.length || 0;
        const diff = Math.max(0, webCount - currentCount);
        setUpdateResult({ webCount, newCount: diff });
      }
    } catch {
      // ignore
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    let active = true;
    safeFetchJson<any>(`/api/novels/${novel.id}/chapters`)
      .then(({ ok, data }) => {
        if (active && ok && data?.success && Array.isArray(data.data)) {
          const sorted = [...data.data].sort((a, b) => a.chapterNumber - b.chapterNumber);
          setChapters(sorted);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoadingChapters(false);
      });

    return () => {
      active = false;
    };
  }, [novel.id]);

  const handleSaveMetadata = async () => {
    setIsSaving(true);
    try {
      const { ok, data } = await safeFetchJson<any>(`/api/novels/${novel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          description: description.trim(),
          coverUrl: coverUrl.trim(),
        }),
      });

      if (ok && data?.data) {
        onUpdateNovel(data.data);
        setIsEditingMeta(false);
      }
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white truncate max-w-md">{novel.title}</h2>
              <p className="text-xs text-slate-400">
                Tác giả: {novel.author} • {novel.chaptersCount} chương ({novel.translatedChaptersCount} đã dịch)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onResumeCrawl && (
              <button
                onClick={() => {
                  onClose();
                  onResumeCrawl(novel);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
                title="Tiếp tục cào thêm chương mới từ nguồn"
              >
                <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
                <span>Tiếp tục cào</span>
              </button>
            )}

            <button
              onClick={() => onOpenEpub(novel)}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Tải EPUB</span>
            </button>

            <button
              onClick={() => onTranslateNovel(novel)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Dịch AI</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Update Notification Banner */}
        {updateResult && (
          <div className="bg-slate-950 border-b border-slate-800 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Kiểm tra nguồn web:</span>
              <span className="text-slate-300">
                Web có <b>{updateResult.webCount} chương</b> (Thư viện có <b>{novel.chaptersCount} chương</b>)
              </span>
              {updateResult.newCount > 0 ? (
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-emerald-300 font-bold">
                  +{updateResult.newCount} chương mới!
                </span>
              ) : (
                <span className="text-emerald-400 font-medium">✓ Đã đầy đủ, chưa có chương mới</span>
              )}
            </div>

            {updateResult.newCount > 0 && onResumeCrawl && (
              <button
                onClick={() => {
                  onClose();
                  onResumeCrawl(novel);
                }}
                className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 transition-colors"
              >
                Cào ngay {updateResult.newCount} chương mới
              </button>
            )}
          </div>
        )}

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Metadata Section */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Thông tin chi tiết tác phẩm
              </h3>
              <div className="flex items-center gap-3">
                {novel.sourceUrl && (
                  <button
                    type="button"
                    onClick={handleCheckWebUpdate}
                    disabled={isCheckingUpdate}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    title="Kiểm tra nguồn web xem có chương mới không"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                    <span>{isCheckingUpdate ? 'Đang kiểm tra...' : 'Kiểm tra chương mới từ web'}</span>
                  </button>
                )}
                <button
                  onClick={() => setIsEditingMeta(!isEditingMeta)}
                  className="text-xs font-semibold text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>{isEditingMeta ? 'Hủy sửa' : 'Chỉnh sửa'}</span>
                </button>
              </div>
            </div>

            {isEditingMeta ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Tên truyện:</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 py-1.5 px-3 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Tác giả:</label>
                    <input
                      type="text"
                      value={author}
                      onChange={e => setAuthor(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 py-1.5 px-3 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">URL ảnh bìa (Cover Image):</label>
                  <input
                    type="text"
                    value={coverUrl}
                    onChange={e => setCoverUrl(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 py-1.5 px-3 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Tóm tắt nội dung:</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-xs text-white"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveMetadata}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>Lưu thay đổi</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4">
                {novel.coverUrl && (
                  <img
                    src={novel.coverUrl}
                    alt={novel.title}
                    className="h-28 w-20 rounded-xl object-cover border border-slate-800 shrink-0"
                  />
                )}
                <div className="space-y-1.5 text-xs text-slate-300">
                  <p><b className="text-slate-400">Nguồn:</b> <span className="font-mono text-[11px]">{novel.sourceDomain}</span> ({novel.sourceUrl})</p>
                  <p><b className="text-slate-400">Ngôn ngữ gốc:</b> {novel.originalLanguage.toUpperCase()} → Dịch sang: VI</p>
                  <p className="text-slate-400 line-clamp-3 leading-relaxed mt-2">{novel.description || 'Không có tóm tắt.'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Chapters Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Danh sách các chương ({chapters.length})
            </h3>

            {isLoadingChapters ? (
              <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Đang tải dữ liệu...
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/80 max-h-72 overflow-y-auto scrollbar-thin">
                {chapters.map(ch => (
                  <div
                    key={ch.id}
                    className="flex items-center justify-between p-3 text-xs hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="overflow-hidden pr-3">
                      <div className="font-bold text-slate-200 truncate">
                        {formatChapterDisplayTitle(ch.chapterNumber, ch.title, ch.translatedTitle)}
                      </div>
                      {ch.translatedTitle && (
                        <div className="text-[10px] text-slate-500 truncate italic">
                          Gốc: {cleanChapterTitle(ch.title, ch.chapterNumber)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-slate-400">
                        {ch.wordCount} chữ
                      </span>
                      {ch.translationStatus === 'translated' ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Đã dịch
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-amber-400">
                          <Clock className="h-3.5 w-3.5" /> Chưa dịch
                        </span>
                      )}

                      <button
                        onClick={() => onReadChapter(novel, ch.chapterNumber)}
                        className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                      >
                        Đọc
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 p-4 bg-slate-950">
          <button
            onClick={() => {
              if (confirm(`Bạn có chắc chắn muốn xóa "${novel.title}"?`)) {
                onDeleteNovel(novel.id);
                onClose();
              }
            }}
            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            <span>Xóa truyện này</span>
          </button>

          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
