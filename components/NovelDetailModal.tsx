'use client';

import React, { useState, useEffect } from 'react';
import { Novel, Chapter } from '@/types/novel';
import { cleanChapterTitle, formatChapterDisplayTitle } from '@/lib/chapter-utils';
import { safeFetchJson } from '@/lib/safe-json';
import { 
  X, BookOpen, Download, Sparkles, Trash2, Edit3, 
  CheckCircle2, Clock, Save, RefreshCw, ExternalLink,
  Search, Filter
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

  // Large chapter collection controls (supporting up to 10,000+ chapters)
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'translated' | 'pending'>('all');
  const [selectedChunk, setSelectedChunk] = useState<number>(0); // 0 = 1-500, 1 = 501-1000...
  const [jumpChapterNum, setJumpChapterNum] = useState<string>('');

  const CHUNK_SIZE = 500;

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
          maxPages: 500,
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
    // Request lightweight chapter headers so 10,000 chapters load instantaneously
    safeFetchJson<any>(`/api/novels/${novel.id}/chapters?headersOnly=true`)
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Danh sách các chương ({chapters.length})
                </h3>
                {novel.chaptersCount > chapters.length && (
                  <span className="text-[11px] text-amber-400 font-medium">
                    (Tổng {novel.chaptersCount} chương)
                  </span>
                )}
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-0.5 rounded-lg font-medium transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tất cả ({chapters.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('translated')}
                  className={`px-2.5 py-0.5 rounded-lg font-medium transition-colors ${
                    statusFilter === 'translated'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-emerald-400'
                  }`}
                >
                  Đã dịch ({chapters.filter(c => c.translationStatus === 'translated').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`px-2.5 py-0.5 rounded-lg font-medium transition-colors ${
                    statusFilter === 'pending'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-amber-400'
                  }`}
                >
                  Chưa dịch ({chapters.filter(c => c.translationStatus !== 'translated').length})
                </button>
              </div>
            </div>

            {/* Search, Filter & Quick Jump Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-xs">
              {/* Search input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Tìm theo số chương hoặc tiêu đề..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Chunk Selector for large novels (> 500 chapters) */}
              {chapters.length > CHUNK_SIZE && !searchTerm.trim() && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Khoảng chương:</span>
                  <select
                    value={selectedChunk}
                    onChange={e => setSelectedChunk(parseInt(e.target.value, 10))}
                    className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                  >
                    {Array.from({ length: Math.ceil(chapters.length / CHUNK_SIZE) }).map((_, idx) => {
                      const start = idx * CHUNK_SIZE + 1;
                      const end = Math.min((idx + 1) * CHUNK_SIZE, chapters.length);
                      return (
                        <option key={idx} value={idx}>
                          Chương {start} - {end}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Jump to Chapter */}
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="Số ch..."
                  value={jumpChapterNum}
                  onChange={e => setJumpChapterNum(e.target.value)}
                  className="w-20 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-center text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const num = parseInt(jumpChapterNum, 10);
                    if (!isNaN(num) && num > 0) {
                      onReadChapter(novel, num);
                    }
                  }}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Đọc ngay
                </button>
              </div>
            </div>

            {isLoadingChapters ? (
              <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Đang tải danh sách {novel.chaptersCount || 0} chương...
              </div>
            ) : (() => {
              // 1. Filter by status
              let filtered = chapters.filter(c => {
                if (statusFilter === 'translated') return c.translationStatus === 'translated';
                if (statusFilter === 'pending') return c.translationStatus !== 'translated';
                return true;
              });

              // 2. Filter by search term
              if (searchTerm.trim()) {
                const term = searchTerm.trim().toLowerCase();
                filtered = filtered.filter(c =>
                  c.chapterNumber.toString().includes(term) ||
                  c.title.toLowerCase().includes(term) ||
                  (c.translatedTitle && c.translatedTitle.toLowerCase().includes(term))
                );
              }

              // 3. Slice by active chunk when no search term
              const totalInFiltered = filtered.length;
              let displayed = filtered;
              if (!searchTerm.trim() && totalInFiltered > CHUNK_SIZE) {
                const start = selectedChunk * CHUNK_SIZE;
                displayed = filtered.slice(start, start + CHUNK_SIZE);
              }

              if (displayed.length === 0) {
                return (
                  <div className="py-8 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-800">
                    Không tìm thấy chương nào phù hợp với bộ lọc tìm kiếm.
                  </div>
                );
              }

              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                    <span>
                      Đang hiển thị {displayed.length} / {totalInFiltered} chương
                      {!searchTerm.trim() && totalInFiltered > CHUNK_SIZE && (
                        <span> (Khoảng {selectedChunk * CHUNK_SIZE + 1} - {Math.min((selectedChunk + 1) * CHUNK_SIZE, totalInFiltered)})</span>
                      )}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/80 max-h-72 overflow-y-auto scrollbar-thin">
                    {displayed.map(ch => (
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
                </div>
              );
            })()}
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
