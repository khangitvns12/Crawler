'use client';

import React, { useState } from 'react';
import { Novel } from '@/types/novel';
import { 
  Search, BookOpen, Download, Sparkles, SlidersHorizontal, 
  ExternalLink, Trash2, CheckCircle2, Clock, Globe, Copy, Check,
  Layers, Plus
} from 'lucide-react';

interface LibraryViewProps {
  novels: Novel[];
  onSelectNovelToRead: (novel: Novel) => void;
  onSelectNovelToTranslate: (novel: Novel) => void;
  onOpenEpubExport: (novel: Novel) => void;
  onOpenNovelDetail: (novel: Novel) => void;
  onOpenNewCrawler: () => void;
  onDeleteNovel: (id: string) => void;
}

export default function LibraryView({
  novels,
  onSelectNovelToRead,
  onSelectNovelToTranslate,
  onOpenEpubExport,
  onOpenNovelDetail,
  onOpenNewCrawler,
  onDeleteNovel,
}: LibraryViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'translated' | 'pending'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredNovels = novels.filter(n => {
    const matchesSearch = 
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.originalTitle && n.originalTitle.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'translated') {
      return n.translatedChaptersCount > 0 && n.translatedChaptersCount >= n.chaptersCount;
    }
    if (statusFilter === 'pending') {
      return n.translatedChaptersCount < n.chaptersCount;
    }
    return true;
  });

  const handleCopyApiUrl = (novelId: string) => {
    const url = `${window.location.origin}/api/v1/novels/${novelId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(novelId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getLanguageLabel = (code: string) => {
    switch (code) {
      case 'zh': return '🇨🇳 Trung Quốc';
      case 'ja': return '🇯🇵 Nhật Bản';
      case 'ko': return '🇰🇷 Hàn Quốc';
      case 'en': return '🇬🇧 Tiếng Anh';
      case 'vi': return '🇻🇳 Tiếng Việt';
      default: return '🌐 Tự động';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Thư viện tiểu thuyết
          </h1>
          <p className="text-sm text-slate-400">
            Quản lý các bộ truyện đã tải xuống, theo dõi tiến độ dịch AI và xuất file đọc offline.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenNewCrawler}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Cào thêm truyện mới</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên truyện, tác giả, tên gốc..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-10 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            Tất cả ({novels.length})
          </button>
          <button
            onClick={() => setStatusFilter('translated')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              statusFilter === 'translated'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            Đã dịch xong
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              statusFilter === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            Cần dịch thêm
          </button>
        </div>
      </div>

      {/* Novel Cards Grid */}
      {filteredNovels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-400 mb-4">
            <BookOpen className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">Không tìm thấy tiểu thuyết nào</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            {searchTerm
              ? 'Không có kết quả khớp với từ khóa tìm kiếm. Hãy thử từ khóa khác.'
              : 'Thư viện hiện đang trống. Hãy nhập URL để cào bộ truyện đầu tiên của bạn!'}
          </p>
          <button
            onClick={onOpenNewCrawler}
            className="mt-5 flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Cào truyện ngay</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredNovels.map(novel => {
            const progressPercent = novel.chaptersCount > 0
              ? Math.round((novel.translatedChaptersCount / novel.chaptersCount) * 100)
              : 0;

            const isFullyTranslated = progressPercent >= 100;

            return (
              <div
                key={novel.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/80 p-5 shadow-lg shadow-black/20 hover:border-slate-700/80 hover:bg-slate-900 transition-all"
              >
                {/* Header with Cover & Basic Info */}
                <div>
                  <div className="flex gap-4">
                    {/* Cover Art */}
                    <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-md">
                      {novel.coverUrl ? (
                        <img
                          src={novel.coverUrl}
                          alt={novel.title}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            // fallback on image load error
                            (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80';
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center bg-gradient-to-b from-indigo-950 to-slate-950">
                          <BookOpen className="h-6 w-6 text-amber-400/80 mb-1" />
                          <span className="text-[10px] font-bold text-slate-300 line-clamp-2">{novel.title}</span>
                        </div>
                      )}

                      {/* VIP Cookie Indicator */}
                      {novel.cookieConfig?.cookieString && (
                        <div className="absolute top-1 left-1 rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-bold text-slate-950 shadow-sm" title="Có cấu hình Cookie VIP">
                          VIP Cookie
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-1 flex-col justify-between overflow-hidden">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                            {getLanguageLabel(novel.originalLanguage)}
                          </span>
                          <span className="truncate text-[10px] text-slate-400">
                            {novel.sourceDomain}
                          </span>
                        </div>

                        <h3 className="mt-1 text-sm font-bold text-slate-100 line-clamp-2 leading-snug group-hover:text-amber-300 transition-colors">
                          {novel.title}
                        </h3>

                        {novel.originalTitle && (
                          <p className="text-[11px] text-slate-400 truncate italic">
                            {novel.originalTitle}
                          </p>
                        )}

                        <p className="mt-1 text-xs text-slate-300 truncate">
                          Tác giả: <span className="text-slate-200 font-medium">{novel.author}</span>
                        </p>
                      </div>

                      {/* Translation Badge */}
                      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                        {isFullyTranslated ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Hoàn tất dịch
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-400 font-medium">
                            <Clock className="h-3.5 w-3.5" /> Dịch {novel.translatedChaptersCount}/{novel.chaptersCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description snippet */}
                  <p className="mt-3.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {novel.description || 'Chưa có thông tin tóm tắt tiểu thuyết.'}
                  </p>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Tiến độ dịch AI</span>
                      <span className="font-semibold text-slate-300">{progressPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isFullyTranslated ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-indigo-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Read Offline */}
                    <button
                      onClick={() => onSelectNovelToRead(novel)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-amber-400" />
                      <span>Đọc ngay</span>
                    </button>

                    {/* AI Translation */}
                    <button
                      onClick={() => onSelectNovelToTranslate(novel)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 active:scale-95 transition-all"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                      <span>{isFullyTranslated ? 'Xem bản dịch' : 'Dịch AI'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-1">
                    {/* Download EPUB */}
                    <button
                      onClick={() => onOpenEpubExport(novel)}
                      className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 p-1 rounded transition-colors"
                      title="Xuất file EPUB để đọc trên máy đọc sách hoặc điện thoại"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Xuất EPUB</span>
                    </button>

                    {/* Manage / TOC */}
                    <button
                      onClick={() => onOpenNovelDetail(novel)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 p-1 rounded transition-colors"
                      title="Xem mục lục chi tiết và thiết lập"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>Mục lục</span>
                    </button>

                    {/* Copy API Link */}
                    <button
                      onClick={() => handleCopyApiUrl(novel.id)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-400 p-1 rounded transition-colors"
                      title="Sao chép link API JSON cho ứng dụng đọc truyện ngoài"
                    >
                      {copiedId === novel.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Link API</span>
                        </>
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => {
                        if (confirm(`Bạn có chắc chắn muốn xóa bộ truyện "${novel.title}" khỏi thư viện?`)) {
                          onDeleteNovel(novel.id);
                        }
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                      title="Xóa truyện"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
