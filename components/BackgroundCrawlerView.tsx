'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Novel, TranslationGenre, BackgroundCrawlJob } from '@/types/novel';
import { safeFetchJson } from '@/lib/safe-json';
import { findPresetForUrl } from '@/lib/preset-extractors';
import {
  Server,
  Cpu,
  Play,
  Pause,
  Trash2,
  BookOpen,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Terminal,
  ChevronDown,
  ChevronUp,
  Layers,
  Search,
  ShieldCheck,
  StopCircle,
  Loader2,
  FolderOpen,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BackgroundCrawlerViewProps {
  onOpenNovelDetail?: (novel: Novel) => void;
  onOpenReader?: (novel: Novel, chapterNum: number) => void;
  onNavigateToLibrary?: () => void;
}

export default function BackgroundCrawlerView({
  onOpenNovelDetail,
  onOpenReader,
  onNavigateToLibrary,
}: BackgroundCrawlerViewProps) {
  // Input form state
  const [url, setUrl] = useState('');
  const [chapterMode, setChapterMode] = useState<'all' | 'first_n' | 'range'>('first_n');
  const [firstNCount, setFirstNCount] = useState<number>(50);
  const [startChapter, setStartChapter] = useState<number>(1);
  const [endChapter, setEndChapter] = useState<number>(100);
  const [delayMs, setDelayMs] = useState<number>(1200);

  // Auto translate state
  const [autoTranslate, setAutoTranslate] = useState<boolean>(true);
  const [translationGenre, setTranslationGenre] = useState<TranslationGenre>('xianxia');

  // Advanced Cookie / Proxy
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [cookieString, setCookieString] = useState<string>('');
  const [userAgent, setUserAgent] = useState<string>(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  const [customProxy, setCustomProxy] = useState<string>('');

  // Quick Inspection State
  const [isInspecting, setIsInspecting] = useState<boolean>(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectedData, setInspectedData] = useState<{
    title?: string;
    author?: string;
    coverUrl?: string;
    description?: string;
    totalChapters?: number;
    firstChapterTitle?: string;
    lastChapterTitle?: string;
  } | null>(null);

  // Background Jobs state
  const [jobs, setJobs] = useState<BackgroundCrawlJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(true);
  const [isSubmittingJob, setIsSubmittingJob] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'paused' | 'completed'>('all');
  const [expandedLogsJobId, setExpandedLogsJobId] = useState<string | null>(null);

  // Polling interval ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll jobs automatically every 2.5 seconds with active flag
  useEffect(() => {
    let isMounted = true;

    const loadJobs = async () => {
      try {
        const { ok, data } = await safeFetchJson<any>('/api/crawler/background-jobs');
        if (isMounted && ok && data?.success && Array.isArray(data.data)) {
          setJobs(data.data);
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setIsLoadingJobs(false);
      }
    };

    loadJobs();
    pollingRef.current = setInterval(() => {
      loadJobs();
    }, 2500);

    return () => {
      isMounted = false;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const reloadJobsNow = async () => {
    try {
      const { ok, data } = await safeFetchJson<any>('/api/crawler/background-jobs');
      if (ok && data?.success && Array.isArray(data.data)) {
        setJobs(data.data);
      }
    } catch {
      // ignore
    }
  };

  // Quick inspection
  const handleInspect = async () => {
    if (!url.trim()) {
      setInspectError('Vui lòng dán liên kết URL truyện.');
      return;
    }

    setIsInspecting(true);
    setInspectError(null);

    const preset = findPresetForUrl(url.trim());

    try {
      const { ok, data, error } = await safeFetchJson<any>('/api/crawler/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          cookieConfig: {
            cookieString,
            userAgent,
            customProxy: customProxy.trim() || undefined,
          },
          crawlerConfig: preset.config,
          fetchAllPages: true,
          maxPages: 150,
        }),
      });

      if (!ok || !data?.data) {
        throw new Error(error || data?.error || 'Không thể đọc thông tin truyện từ URL này');
      }

      const info = data.data;
      const total = info.chapters?.length || 0;

      setInspectedData({
        title: info.title,
        author: info.author,
        coverUrl: info.coverUrl,
        description: info.description,
        totalChapters: total,
        firstChapterTitle: info.chapters?.[0]?.title,
        lastChapterTitle: info.chapters?.[total - 1]?.title,
      });

      if (total > 0) {
        setStartChapter(1);
        setEndChapter(Math.min(total, 100));
        setFirstNCount(Math.min(total, 50));
      }
    } catch (err: unknown) {
      setInspectError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInspecting(false);
    }
  };

  // Start background job
  const handleStartBackgroundJob = async () => {
    if (!url.trim()) {
      setSubmitError('Vui lòng nhập URL truyện để bắt đầu cào ngầm.');
      return;
    }

    setIsSubmittingJob(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    let startNum = 1;
    let endNum: number | undefined = undefined;
    let maxCount: number | undefined = undefined;

    if (chapterMode === 'all') {
      startNum = 1;
      endNum = undefined;
      maxCount = undefined;
    } else if (chapterMode === 'first_n') {
      startNum = 1;
      maxCount = firstNCount;
    } else if (chapterMode === 'range') {
      startNum = Math.max(1, startChapter);
      endNum = Math.max(startNum, endChapter);
    }

    try {
      const { ok, data, error } = await safeFetchJson<any>('/api/crawler/background-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          startChapter: startNum,
          endChapter: endNum,
          maxChapters: maxCount,
          autoTranslate,
          translationGenre,
          delayMs,
          cookieConfig: {
            cookieString,
            userAgent,
            customProxy: customProxy.trim() || undefined,
          },
          preferredNovelTitle: inspectedData?.title,
        }),
      });

      if (!ok || !data?.success) {
        throw new Error(error || data?.error || 'Lỗi khi khởi chạy tiến trình cào ngầm');
      }

      setSubmitSuccess(
        '✓ Đã khởi động thành công tiến trình cào ngầm trên máy chủ! Bạn có thể tắt tab, máy chủ vẫn tự cào và lưu vào Supabase.'
      );

      // Auto expand logs of the newly created job
      if (data.data?.id) {
        setExpandedLogsJobId(data.data.id);
      }

      await reloadJobsNow();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingJob(false);
    }
  };

  // Job Action (Pause, Resume, Cancel)
  const handleJobAction = async (jobId: string, action: 'pause' | 'resume' | 'cancel') => {
    try {
      await safeFetchJson(`/api/crawler/background-jobs/${jobId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await reloadJobsNow();
    } catch (err) {
      console.warn('Job action error:', err);
    }
  };

  // Delete Job
  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tác vụ cào ngầm này khỏi danh sách?')) return;
    try {
      await safeFetchJson(`/api/crawler/background-jobs/${jobId}`, {
        method: 'DELETE',
      });
      await reloadJobsNow();
    } catch (err) {
      console.warn('Delete job error:', err);
    }
  };

  // Filter jobs
  const filteredJobs = jobs.filter(j => {
    if (statusFilter === 'all') return true;
    return j.status === statusFilter;
  });

  const activeRunningCount = jobs.filter(j => j.status === 'running').length;

  return (
    <div className="space-y-8 pb-16">
      {/* Hero Banner with Explanation */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950 p-6 sm:p-8 shadow-2xl shadow-indigo-950/30">
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
                <Server className="h-3.5 w-3.5 animate-pulse text-indigo-400" />
                Server Worker Chạy Ngầm Độc Lập
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Lưu Trực Tiếp Vào Supabase
              </span>
              {activeRunningCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  Đang cào {activeRunningCount} tác vụ
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Cào Truyện Ngầm Tự Động{' '}
              <span className="bg-gradient-to-r from-amber-400 to-indigo-400 bg-clip-text text-transparent">
                (Đóng Tab Vẫn Cào)
              </span>
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
              Dán liên kết truyện, chọn số chương cần cào và bấm bắt đầu. Tác vụ được thực thi trực tiếp trên
              tiến trình máy chủ Node.js và liên tục lưu từng chương vào <strong>Supabase</strong>. Bạn có thể{' '}
              <strong className="text-amber-300">đóng tab</strong>,{' '}
              <strong className="text-amber-300">tắt trình duyệt</strong> hoặc{' '}
              <strong className="text-amber-300">tắt máy</strong> — server vẫn tự động cào cho đến khi hoàn thành
              100%!
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex sm:flex-col gap-3 shrink-0">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-center min-w-[140px] backdrop-blur-sm">
              <div className="text-xs font-medium text-slate-400">Đang chạy ngầm</div>
              <div className="text-2xl font-bold text-indigo-400 mt-1">{activeRunningCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-center min-w-[140px] backdrop-blur-sm">
              <div className="text-xs font-medium text-slate-400">Tổng tác vụ</div>
              <div className="text-2xl font-bold text-slate-200 mt-1">{jobs.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Form (Left) & Active Tasks (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Cpu className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Khởi Tạo Tác Vụ Cào Ngầm</h2>
                  <p className="text-xs text-slate-400">Cấu hình liên kết và khoảng chương cần cào</p>
                </div>
              </div>
            </div>

            {/* URL Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Liên kết truyện (URL)</span>
                <span className="text-[11px] text-slate-400 font-normal">Hỗ trợ Novel543, 69Shuba, xBiquge...</span>
              </label>

              <div className="relative">
                <input
                  type="url"
                  value={url}
                  onChange={e => {
                    setUrl(e.target.value);
                    setInspectedData(null);
                  }}
                  placeholder="https://www.novel543.com/0312506018/ hoặc 69shuba, biquge..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 pr-24 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleInspect}
                  disabled={isInspecting || !url.trim()}
                  className="absolute right-1.5 top-1.5 flex items-center gap-1.5 rounded-lg bg-indigo-600/90 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isInspecting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Đang dò...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-3 w-3" />
                      <span>Dò mục lục</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400 self-center mr-1">Mẫu nhanh:</span>
                <button
                  type="button"
                  onClick={() => {
                    setUrl('https://www.novel543.com/0312506018/');
                    setInspectedData(null);
                  }}
                  className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-300 hover:border-teal-500/60 transition-colors"
                >
                  🇹🇼 Novel543 (稷下書院)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUrl('https://www.69shuba.com/book/90442.htm');
                    setInspectedData(null);
                  }}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-300 hover:border-slate-700 transition-colors"
                >
                  🇨🇳 69Shuba
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUrl('https://www.xbiquge.info/135/135260/');
                    setInspectedData(null);
                  }}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300 hover:border-amber-500/60 transition-colors"
                >
                  🇨🇳 xBiquge
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUrl('https://truyenfull.io/dau-pha-thuong-khung/');
                    setInspectedData(null);
                  }}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-300 hover:border-slate-700 transition-colors"
                >
                  🇻🇳 TruyenFull
                </button>
              </div>

              {inspectError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{inspectError}</span>
                </div>
              )}
            </div>

            {/* Inspected Data Preview Card */}
            {inspectedData && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3.5 space-y-2.5"
              >
                <div className="flex gap-3 items-start">
                  {inspectedData.coverUrl && (
                    <img
                      src={inspectedData.coverUrl}
                      alt={inspectedData.title || ''}
                      className="h-16 w-12 rounded object-cover border border-slate-700 shrink-0 shadow"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="text-xs font-bold text-white truncate">{inspectedData.title}</h3>
                    <p className="text-[11px] text-slate-300 truncate">Tác giả: {inspectedData.author || 'Khuyết danh'}</p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                        ✓ Tìm thấy {inspectedData.totalChapters?.toLocaleString()} chương
                      </span>
                    </div>
                  </div>
                </div>
                {inspectedData.description && (
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed border-t border-indigo-500/10 pt-2">
                    {inspectedData.description}
                  </p>
                )}
              </motion.div>
            )}

            {/* Chapter Selection Mode */}
            <div className="space-y-3 border-t border-slate-800/80 pt-4">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Số lượng chương muốn cào</span>
                {inspectedData?.totalChapters && (
                  <span className="text-[11px] text-indigo-400 font-medium">
                    (Có sẵn {inspectedData.totalChapters} chương)
                  </span>
                )}
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setChapterMode('first_n')}
                  className={`rounded-xl border p-2.5 text-center text-xs font-medium transition-all ${
                    chapterMode === 'first_n'
                      ? 'border-indigo-500 bg-indigo-600/20 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div>N chương đầu</div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">Khuyên dùng</div>
                </button>

                <button
                  type="button"
                  onClick={() => setChapterMode('range')}
                  className={`rounded-xl border p-2.5 text-center text-xs font-medium transition-all ${
                    chapterMode === 'range'
                      ? 'border-indigo-500 bg-indigo-600/20 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div>Khoảng chương</div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">Từ X đến Y</div>
                </button>

                <button
                  type="button"
                  onClick={() => setChapterMode('all')}
                  className={`rounded-xl border p-2.5 text-center text-xs font-medium transition-all ${
                    chapterMode === 'all'
                      ? 'border-indigo-500 bg-indigo-600/20 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div>Tất cả chương</div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">Cào toàn bộ</div>
                </button>
              </div>

              {/* Mode: First N chapters */}
              {chapterMode === 'first_n' && (
                <div className="space-y-2 rounded-xl bg-slate-950/60 p-3 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Số lượng chương:</span>
                    <span className="font-bold text-amber-300">{firstNCount} chương đầu tiên</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[10, 25, 50, 100, 200, 500].map(cnt => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setFirstNCount(cnt)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          firstNCount === cnt
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        +{cnt} ch
                      </button>
                    ))}
                  </div>
                  <div className="pt-1">
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={firstNCount}
                      onChange={e => setFirstNCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                      placeholder="Nhập số chương tùy ý..."
                    />
                  </div>
                </div>
              )}

              {/* Mode: Custom Range */}
              {chapterMode === 'range' && (
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-950/60 p-3 border border-slate-800/80">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Từ chương:</label>
                    <input
                      type="number"
                      min={1}
                      value={startChapter}
                      onChange={e => setStartChapter(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Đến chương:</label>
                    <input
                      type="number"
                      min={startChapter}
                      value={endChapter}
                      onChange={e => setEndChapter(Math.max(startChapter, parseInt(e.target.value) || startChapter))}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div className="col-span-2 text-[11px] text-slate-400">
                    Sẽ cào: <span className="text-white font-semibold">{Math.max(0, endChapter - startChapter + 1)} chương</span>
                  </div>
                </div>
              )}

              {/* Mode: All Chapters */}
              {chapterMode === 'all' && (
                <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800/80 text-xs text-slate-300">
                  Sẽ cào toàn bộ danh sách chương tìm thấy trên trang nguồn ({inspectedData?.totalChapters || 'toàn bộ'} chương).
                </div>
              )}
            </div>

            {/* Translation & Speed Options */}
            <div className="space-y-3 border-t border-slate-800/80 pt-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTranslate}
                    onChange={e => setAutoTranslate(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    Tự động dịch AI Tiếng Việt (Gemini)
                  </span>
                </label>
              </div>

              {autoTranslate && (
                <div className="pl-6 space-y-2">
                  <label className="text-[11px] text-slate-400 block">Văn phong dịch thuật:</label>
                  <select
                    value={translationGenre}
                    onChange={e => setTranslationGenre(e.target.value as TranslationGenre)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white"
                  >
                    <option value="xianxia">Tiên hiệp / Kiếm hiệp / Huyền huyễn</option>
                    <option value="modern">Đô thị / Hiện đại / Ngôn tình</option>
                    <option value="lightnovel">Light Novel Nhật Bản</option>
                    <option value="webnovel">Webnovel phương Tây / Khoa huyễn</option>
                    <option value="general">Văn phong phổ thông</option>
                  </select>
                </div>
              )}

              {/* Crawl Delay */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400">Khoảng nghỉ giữa các chương:</span>
                <select
                  value={delayMs}
                  onChange={e => setDelayMs(parseInt(e.target.value))}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-white"
                >
                  <option value={800}>Nhanh (800ms)</option>
                  <option value={1200}>Tiêu chuẩn (1.2s - Khuyên dùng)</option>
                  <option value={2000}>An toàn (2.0s - Chống chặn IP)</option>
                  <option value={3000}>Chậm (3.0s)</option>
                </select>
              </div>
            </div>

            {/* Advanced Cookie & Proxy Collapsible */}
            <div className="border-t border-slate-800/80 pt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
              >
                <span>Cấu hình nâng cao (Cookie VIP / Proxy)</span>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Cookie String (Nếu truyện VIP):</label>
                    <textarea
                      rows={2}
                      value={cookieString}
                      onChange={e => setCookieString(e.target.value)}
                      placeholder="session=xyz; cf_clearance=abc..."
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Custom Proxy / Scraper API URL:</label>
                    <input
                      type="text"
                      value={customProxy}
                      onChange={e => setCustomProxy(e.target.value)}
                      placeholder="http://user:pass@proxy-server:8080"
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Submit Errors / Success */}
            {submitError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {submitSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{submitSuccess}</span>
              </div>
            )}

            {/* Big Action Button */}
            <button
              type="button"
              onClick={handleStartBackgroundJob}
              disabled={isSubmittingJob || !url.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-amber-600 py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 hover:from-indigo-500 hover:to-amber-500 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmittingJob ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang khởi tạo tiến trình trên server...</span>
                </>
              ) : (
                <>
                  <Server className="h-4 w-4" />
                  <span>🚀 Bắt Đầu Cào Ngầm Trên Máy Chủ</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-center text-slate-400">
              💡 Sau khi bấm, bạn có thể thoải mái đóng trình duyệt. Máy chủ sẽ tự chạy ngầm và lưu vào Supabase.
            </p>
          </div>
        </div>

        {/* Background Tasks List & Live Monitor (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm shadow-xl space-y-6">
            {/* Header with Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Tiến Trình Cào Ngầm Đang Chạy</h2>
                  <p className="text-xs text-slate-400">Tự động cập nhật mỗi 2.5 giây từ máy chủ</p>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
                {(['all', 'running', 'paused', 'completed'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      statusFilter === tab
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab === 'all' && `Tất cả (${jobs.length})`}
                    {tab === 'running' && `Đang cào (${jobs.filter(j => j.status === 'running').length})`}
                    {tab === 'paused' && `Tạm dừng (${jobs.filter(j => j.status === 'paused').length})`}
                    {tab === 'completed' && `Xong (${jobs.filter(j => j.status === 'completed').length})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Jobs List */}
            {isLoadingJobs && jobs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-400" />
                <p className="text-xs">Đang tải danh sách tác vụ từ máy chủ...</p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-3 rounded-2xl border border-dashed border-slate-800 p-8">
                <Server className="h-8 w-8 mx-auto text-slate-600" />
                <div className="text-sm font-semibold text-slate-300">Chưa có tác vụ cào ngầm nào</div>
                <p className="text-xs max-w-sm mx-auto text-slate-500">
                  Dán link truyện ở khung bên trái và bấm &quot;Bắt đầu cào ngầm trên máy chủ&quot; để tạo tác vụ độc lập đầu tiên.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredJobs.map(job => {
                  const percent = job.totalChaptersToCrawl > 0
                    ? Math.round((job.completedChaptersCount / job.totalChaptersToCrawl) * 100)
                    : 0;
                  const isLogsOpen = expandedLogsJobId === job.id;

                  return (
                    <div
                      key={job.id}
                      className="rounded-2xl border border-slate-800/90 bg-slate-950/70 p-4 sm:p-5 space-y-4 transition-all hover:border-slate-700 shadow-md"
                    >
                      {/* Job Top Row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {job.novelCoverUrl ? (
                            <img
                              src={job.novelCoverUrl}
                              alt={job.novelTitle}
                              className="h-14 w-10 rounded object-cover border border-slate-800 shrink-0 shadow"
                            />
                          ) : (
                            <div className="flex h-14 w-10 items-center justify-center rounded bg-slate-900 border border-slate-800 text-slate-600 shrink-0">
                              <BookOpen className="h-5 w-5" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                                {job.novelTitle}
                              </h3>
                              {job.novelOriginalTitle && job.novelOriginalTitle !== job.novelTitle && (
                                <span className="text-[10px] text-slate-500 truncate">
                                  ({job.novelOriginalTitle})
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-400 flex items-center gap-2">
                              <span>Tác giả: {job.novelAuthor || 'Khuyết danh'}</span>
                              <span>•</span>
                              <span className="text-slate-500 truncate max-w-[150px]">{job.sourceDomain}</span>
                            </p>

                            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                              {/* Status Badges */}
                              {job.status === 'running' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-bold text-emerald-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                                  Đang cào ngầm (Server)
                                </span>
                              )}
                              {job.status === 'paused' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-semibold text-amber-300">
                                  <Pause className="h-3 w-3" />
                                  Tạm dừng
                                </span>
                              )}
                              {job.status === 'completed' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 font-bold text-blue-400">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Hoàn thành 100%
                                </span>
                              )}
                              {job.status === 'cancelled' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 font-medium text-slate-400">
                                  <StopCircle className="h-3 w-3" />
                                  Đã hủy
                                </span>
                              )}
                              {job.status === 'failed' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 font-semibold text-red-400">
                                  <AlertTriangle className="h-3 w-3" />
                                  Lỗi
                                </span>
                              )}

                              {job.autoTranslate && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-300">
                                  <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                                  AI Dịch Gemini
                                </span>
                              )}

                              <span className="text-slate-500">
                                Ch. {job.startChapterNumber} ➜ Ch. {job.endChapterNumber}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {job.status === 'running' && (
                            <button
                              type="button"
                              onClick={() => handleJobAction(job.id, 'pause')}
                              title="Tạm dừng cào"
                              className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors cursor-pointer"
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {job.status === 'paused' && (
                            <button
                              type="button"
                              onClick={() => handleJobAction(job.id, 'resume')}
                              title="Tiếp tục cào"
                              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {['running', 'paused'].includes(job.status) && (
                            <button
                              type="button"
                              onClick={() => handleJobAction(job.id, 'cancel')}
                              title="Hủy tác vụ"
                              className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:border-red-500/50 hover:text-red-300 transition-colors cursor-pointer"
                            >
                              <StopCircle className="h-3.5 w-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteJob(job.id)}
                            title="Xóa tác vụ khỏi danh sách"
                            className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-500 hover:border-slate-700 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5 bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                            {job.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />}
                            <span>
                              {job.status === 'running'
                                ? `Đang cào: ${job.currentChapterTitle || `Chương ${job.currentChapterNumber}`}`
                                : job.status === 'completed'
                                ? 'Đã hoàn tất toàn bộ chương!'
                                : `Tiến độ: ${job.completedChaptersCount}/${job.totalChaptersToCrawl} chương`}
                            </span>
                          </span>
                          <span className="font-bold text-amber-300 text-sm">{percent}%</span>
                        </div>

                        {/* Visual Bar */}
                        <div className="h-2.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                          <motion.div
                            className={`h-full rounded-full ${
                              job.status === 'completed'
                                ? 'bg-gradient-to-r from-blue-500 to-emerald-500'
                                : job.status === 'failed'
                                ? 'bg-red-500'
                                : 'bg-gradient-to-r from-indigo-500 via-amber-500 to-emerald-400'
                            }`}
                            initial={false}
                            animate={{ width: `${percent}%` }}
                            transition={{ ease: 'easeOut', duration: 0.4 }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                          <span>
                            Đã lưu Supabase: <strong className="text-emerald-400">{job.completedChaptersCount}</strong> / {job.totalChaptersToCrawl} chương
                          </span>
                          {job.failedChaptersCount > 0 && (
                            <span className="text-red-400">Lỗi: {job.failedChaptersCount} chương</span>
                          )}
                          <span>Khởi tạo: {new Date(job.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {/* Bottom Link Bar: Open Novel, Read, Toggle Logs */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-xs">
                        <div className="flex items-center gap-2">
                          {onNavigateToLibrary && (
                            <button
                              type="button"
                              onClick={onNavigateToLibrary}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-950/60 border border-indigo-500/20 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:bg-indigo-900/60 transition-colors cursor-pointer"
                            >
                              <FolderOpen className="h-3 w-3" />
                              <span>Mở Thư viện</span>
                            </button>
                          )}
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                          >
                            <span>Trang nguồn</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>

                        {/* Toggle Logs Button */}
                        <button
                          type="button"
                          onClick={() => setExpandedLogsJobId(isLogsOpen ? null : job.id)}
                          className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <Terminal className="h-3 w-3 text-amber-400" />
                          <span>{isLogsOpen ? 'Thu gọn log' : `Xem nhật ký server (${job.logs?.length || 0})`}</span>
                          {isLogsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>

                      {/* Real-time Log Stream Terminal */}
                      <AnimatePresence>
                        {isLogsOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden pt-2"
                          >
                            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] space-y-1.5 max-h-56 overflow-y-auto">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-2 text-[10px] text-slate-500">
                                <span>LIVE LOG STREAM ({job.id})</span>
                                <span className="text-emerald-400">● LIVE</span>
                              </div>

                              {(!job.logs || job.logs.length === 0) ? (
                                <div className="text-slate-600 italic">Chưa có nhật ký nào được ghi lại...</div>
                              ) : (
                                job.logs.map(log => {
                                  let color = 'text-slate-300';
                                  if (log.type === 'success') color = 'text-emerald-400';
                                  if (log.type === 'warning') color = 'text-amber-400';
                                  if (log.type === 'error') color = 'text-red-400';

                                  return (
                                    <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                                      <span className="text-slate-600 shrink-0 text-[10px]">
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                      </span>
                                      <span className={color}>{log.text}</span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
