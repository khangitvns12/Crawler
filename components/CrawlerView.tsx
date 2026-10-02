'use client';

import React, { useState } from 'react';
import { Novel, Chapter, CookieConfig, CrawlerConfig } from '@/types/novel';
import { SITE_PRESETS, findPresetForUrl } from '@/lib/preset-extractors';
import { 
  Compass, ShieldCheck, Key, RefreshCw, AlertCircle, Play, 
  Pause, CheckCircle2, ChevronDown, ChevronUp, Globe, FileText,
  Sliders, ArrowRight, Sparkles, ExternalLink
} from 'lucide-react';

interface CrawlerViewProps {
  onNovelCrawled: (novel: Novel, chapters: Chapter[]) => void;
  onGoToTranslate: (novel: Novel) => void;
}

export default function CrawlerView({
  onNovelCrawled,
  onGoToTranslate,
}: CrawlerViewProps) {
  const [url, setUrl] = useState('');
  const [detectedPreset, setDetectedPreset] = useState<string>('generic');
  
  // Cookie Configuration
  const [showCookiePanel, setShowCookiePanel] = useState(false);
  const [cookieString, setCookieString] = useState('');
  const [userAgent, setUserAgent] = useState('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  const [referer, setReferer] = useState('');

  // Cookie Test State
  const [isTestingCookie, setIsTestingCookie] = useState(false);
  const [cookieTestResult, setCookieTestResult] = useState<any>(null);
  const [cookieTestError, setCookieTestError] = useState<string | null>(null);

  // Inspect State
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectedNovel, setInspectedNovel] = useState<{
    title: string;
    author: string;
    description: string;
    coverUrl: string;
    chapters: Array<{ number: number; title: string; url: string }>;
  } | null>(null);

  // Crawl Range & Speed
  const [fromChapter, setFromChapter] = useState(1);
  const [toChapter, setToChapter] = useState(5);
  const [delayMs, setDelayMs] = useState(1000);

  // Active Crawl State
  const [isCrawling, setIsCrawling] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [currentChapterTitle, setCurrentChapterTitle] = useState('');
  const [crawledChapters, setCrawledChapters] = useState<Chapter[]>([]);
  const [crawlLogs, setCrawlLogs] = useState<Array<{ text: string; type: 'info' | 'success' | 'error' }>>([]);
  const [crawledNovelResult, setCrawledNovelResult] = useState<Novel | null>(null);

  // Handle URL change & Preset Detection
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    const preset = findPresetForUrl(newUrl);
    setDetectedPreset(preset.id);
  };

  // Test Cookie Connection
  const handleTestCookie = async () => {
    if (!url.trim()) {
      setCookieTestError('Vui lòng nhập URL truyện trước khi kiểm tra cookie.');
      return;
    }

    setIsTestingCookie(true);
    setCookieTestError(null);
    setCookieTestResult(null);

    try {
      const res = await fetch('/api/crawler/test-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          cookieConfig: {
            cookieString,
            userAgent,
            referer: referer || undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi kiểm tra cookie');
      setCookieTestResult(data);
    } catch (err: unknown) {
      setCookieTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTestingCookie(false);
    }
  };

  // Inspect Novel URL
  const handleInspect = async () => {
    if (!url.trim()) {
      setInspectError('Vui lòng nhập URL truyện cần cào.');
      return;
    }

    setIsInspecting(true);
    setInspectError(null);
    setInspectedNovel(null);
    setCrawledNovelResult(null);

    const preset = findPresetForUrl(url);
    const cookieConfig: CookieConfig = {
      cookieString,
      userAgent,
      referer: referer || undefined,
    };

    try {
      const res = await fetch('/api/crawler/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          cookieConfig,
          crawlerConfig: preset.config,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể trích xuất thông tin truyện');

      setInspectedNovel(data.data);
      if (data.data.chapters && data.data.chapters.length > 0) {
        setFromChapter(1);
        setToChapter(Math.min(data.data.chapters.length, 5));
      }
    } catch (err: unknown) {
      setInspectError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInspecting(false);
    }
  };

  // Batch Crawl Chapters
  const handleStartCrawl = async () => {
    if (!inspectedNovel || !inspectedNovel.chapters.length) return;

    setIsCrawling(true);
    setIsPaused(false);
    setCrawlLogs([]);
    setCrawledChapters([]);
    setCrawlProgress(0);

    const targetChapters = inspectedNovel.chapters.filter(
      c => c.number >= fromChapter && c.number <= toChapter
    );

    const cookieConfig: CookieConfig = {
      cookieString,
      userAgent,
      referer: referer || undefined,
    };

    const preset = findPresetForUrl(url);
    const chaptersAccumulated: Chapter[] = [];
    const novelId = `novel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    for (let i = 0; i < targetChapters.length; i++) {
      const item = targetChapters[i];
      setCurrentChapterTitle(`[Chương ${item.number}] ${item.title}`);
      
      setCrawlLogs(prev => [
        { text: `Đang cào Chương ${item.number}: ${item.title}...`, type: 'info' },
        ...prev.slice(0, 50),
      ]);

      try {
        const res = await fetch('/api/crawler/chapter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: item.url,
            cookieConfig,
            crawlerConfig: preset.config,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lỗi bóc tách chương');

        const newChapter: Chapter = {
          id: `chap-${novelId}-${item.number}`,
          novelId,
          chapterNumber: item.number,
          title: data.data.title || item.title,
          sourceUrl: item.url,
          rawContent: data.data.content,
          translationStatus: 'pending',
          wordCount: data.data.wordCount,
          createdAt: new Date().toISOString(),
        };

        chaptersAccumulated.push(newChapter);
        setCrawledChapters([...chaptersAccumulated]);

        setCrawlLogs(prev => [
          { text: `✓ Hoàn tất Chương ${item.number} (${data.data.wordCount} chữ)`, type: 'success' },
          ...prev.slice(0, 50),
        ]);
      } catch (err: unknown) {
        const errorText = err instanceof Error ? err.message : String(err);
        setCrawlLogs(prev => [
          { text: `✗ Lỗi Chương ${item.number}: ${errorText}`, type: 'error' },
          ...prev.slice(0, 50),
        ]);
      }

      setCrawlProgress(Math.round(((i + 1) / targetChapters.length) * 100));

      // Rate limit delay
      if (i < targetChapters.length - 1 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Save Novel & Chapters to Library
    const domain = new URL(url).hostname;
    let origLang: Novel['originalLanguage'] = 'zh';
    if (domain.includes('syosetu') || domain.includes('kakuyomu')) origLang = 'ja';
    else if (domain.includes('novelfull')) origLang = 'en';

    const finalNovel: Novel = {
      id: novelId,
      title: inspectedNovel.title,
      author: inspectedNovel.author,
      description: inspectedNovel.description,
      coverUrl: inspectedNovel.coverUrl,
      sourceUrl: url,
      sourceDomain: domain,
      originalLanguage: origLang,
      targetLanguage: 'vi',
      status: 'ongoing',
      chaptersCount: chaptersAccumulated.length,
      translatedChaptersCount: 0,
      cookieConfig,
      crawlerConfig: preset.config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      // Save novel
      await fetch('/api/novels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalNovel),
      });

      // Save chapters
      await fetch(`/api/novels/${novelId}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chaptersAccumulated),
      });

      setCrawledNovelResult(finalNovel);
      onNovelCrawled(finalNovel, chaptersAccumulated);
    } catch {
      // Non-fatal
    }

    setIsCrawling(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Bộ cào truyện & Tích hợp Cookie VIP
        </h1>
        <p className="text-sm text-slate-400">
          Tự động cào tiểu thuyết từ các website raw Trung, Nhật, Anh, Việt. Tích hợp Cookie và Header để vượt Cloudflare, cào chương VIP hoặc giới hạn thành viên.
        </p>
      </div>

      {/* Main Scraper Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6 shadow-xl space-y-5">
        {/* Step 1: Input URL */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
            URL Trang chủ tiểu thuyết hoặc Mục lục chương
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={url}
                onChange={e => handleUrlChange(e.target.value)}
                placeholder="Ví dụ: https://ncode.syosetu.com/n2267be/ hoặc https://www.69shuba.cx/book/48123.htm"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <button
              onClick={handleInspect}
              disabled={isInspecting || isCrawling}
              className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 hover:bg-amber-400 disabled:opacity-50 transition-all shrink-0"
            >
              {isInspecting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Đang bóc tách...</span>
                </>
              ) : (
                <>
                  <Compass className="h-4 w-4" />
                  <span>Phân tích & Lấy mục lục</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Preset Buttons */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Mẫu thử nhanh:</span>
            <button
              onClick={() => handleUrlChange('https://ncode.syosetu.com/n2267be/')}
              className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
            >
              🇯🇵 Syosetu (Re:Zero Nhật)
            </button>
            <button
              onClick={() => handleUrlChange('https://www.69shuba.cx/book/48123.htm')}
              className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
            >
              🇨🇳 69Shuba (Trung Raw)
            </button>
            <button
              onClick={() => handleUrlChange('https://novelfull.net/sample-novel.html')}
              className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
            >
              🇬🇧 NovelFull (Tiếng Anh)
            </button>

            {detectedPreset && (
              <span className="ml-auto rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-[10px] font-medium text-indigo-400">
                Preset: {SITE_PRESETS.find(p => p.id === detectedPreset)?.name || 'Tự động'}
              </span>
            )}
          </div>
        </div>

        {/* Accordion: Cookie & VIP Configuration */}
        <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 overflow-hidden">
          <button
            onClick={() => setShowCookiePanel(!showCookiePanel)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-900/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-200">
                  Cấu hình Cookie & Header VIP (Vượt Cloudflare, VIP/R18)
                </span>
                <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {cookieString ? 'Đã thiết lập Cookie' : 'Chưa có Cookie'}
                </span>
              </div>
            </div>
            {showCookiePanel ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showCookiePanel && (
            <div className="border-t border-slate-800/80 p-4 space-y-4 bg-slate-950">
              {/* Instructions */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300/90 leading-relaxed">
                <div className="flex items-center gap-1.5 font-semibold text-amber-300 mb-1">
                  <ShieldCheck className="h-4 w-4" /> Hướng dẫn lấy Cookie từ trình duyệt:
                </div>
                1. Mở trang web truyện trên Chrome/Edge/Firefox và đăng nhập tài khoản VIP của bạn.<br />
                2. Nhấn <kbd className="rounded bg-slate-800 px-1 text-[11px] text-white">F12</kbd> (DevTools) → Chọn tab <b>Application</b> (hoặc <b>Storage</b>) → <b>Cookies</b>.<br />
                3. Hoặc vào tab <b>Network</b>, nhấn F5, chọn request đầu tiên, sao chép chuỗi <code>Cookie: ...</code> và dán vào ô bên dưới.
              </div>

              {/* Cookie Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Chuỗi Cookie (Cookie String):
                </label>
                <textarea
                  rows={2}
                  value={cookieString}
                  onChange={e => setCookieString(e.target.value)}
                  placeholder="Ví dụ: cf_clearance=abc123xyz...; session_token=user_88291; PHPSESSID=..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* User Agent & Referer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    User-Agent:
                  </label>
                  <select
                    value={userAgent}
                    onChange={e => setUserAgent(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 px-3 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36">
                      Chrome 124 (Windows Desktop - Chuẩn)
                    </option>
                    <option value="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1">
                      Safari 17 (iPhone Mobile)
                    </option>
                    <option value="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36">
                      Chrome (Mac OS X)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Referer (Tùy chọn):
                  </label>
                  <input
                    type="text"
                    value={referer}
                    onChange={e => setReferer(e.target.value)}
                    placeholder="Mặc định: Domain trang chủ truyện"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 px-3 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Test Cookie Button & Results */}
              <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestCookie}
                  disabled={isTestingCookie || !url}
                  className="flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 active:scale-95 disabled:opacity-50 transition-all"
                >
                  {isTestingCookie ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Đang kiểm tra cookie...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Kiểm tra kết nối Cookie</span>
                    </>
                  )}
                </button>

                {cookieTestResult && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1 font-semibold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> HTTP {cookieTestResult.status} ({cookieTestResult.durationMs}ms)
                    </span>
                    <span className="text-slate-400">• Kích thước: {Math.round(cookieTestResult.pageSizeBytes / 1024)} KB</span>
                    {cookieTestResult.isCloudflareBlocked ? (
                      <span className="text-rose-400 font-medium">⚠️ Cloudflare phát hiện</span>
                    ) : (
                      <span className="text-emerald-400 font-medium">✓ Vượt Cloudflare thành công</span>
                    )}
                  </div>
                )}

                {cookieTestError && (
                  <div className="text-xs text-rose-400 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> {cookieTestError}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {inspectError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{inspectError}</span>
          </div>
        )}

        {/* Step 2: Inspected Result Preview */}
        {inspectedNovel && (
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Cover Preview */}
              {inspectedNovel.coverUrl ? (
                <img
                  src={inspectedNovel.coverUrl}
                  alt={inspectedNovel.title}
                  className="h-36 w-28 rounded-xl object-cover border border-slate-800 shrink-0 self-center sm:self-start shadow-md"
                />
              ) : (
                <div className="flex h-36 w-28 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-800 text-slate-400 self-center sm:self-start">
                  <FileText className="h-8 w-8 mb-1 text-slate-500" />
                  <span className="text-[10px]">Chưa có ảnh</span>
                </div>
              )}

              {/* Info */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                    Phân tích thành công
                  </span>
                  <span className="text-xs text-slate-400">
                    Tìm thấy <b className="text-white">{inspectedNovel.chapters.length}</b> chương
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white">
                  {inspectedNovel.title}
                </h3>
                <p className="text-xs text-slate-300">
                  Tác giả: <span className="font-semibold text-amber-400">{inspectedNovel.author}</span>
                </p>
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                  {inspectedNovel.description}
                </p>
              </div>
            </div>

            {/* Crawl Range Settings */}
            <div className="border-t border-slate-800/80 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-slate-300 font-semibold">Phạm vi cào:</span>
                <div className="flex items-center gap-1.5">
                  <label className="text-slate-400">Từ chương:</label>
                  <input
                    type="number"
                    min={1}
                    max={inspectedNovel.chapters.length}
                    value={fromChapter}
                    onChange={e => setFromChapter(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center font-bold text-white"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="text-slate-400">Đến chương:</label>
                  <input
                    type="number"
                    min={fromChapter}
                    max={inspectedNovel.chapters.length}
                    value={toChapter}
                    onChange={e => setToChapter(Math.min(inspectedNovel.chapters.length, parseInt(e.target.value) || 1))}
                    className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center font-bold text-white"
                  />
                </div>

                <div className="flex items-center gap-1.5 ml-auto md:ml-4">
                  <label className="text-slate-400">Giãn cách (ms):</label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={200}
                    value={delayMs}
                    onChange={e => setDelayMs(parseInt(e.target.value) || 0)}
                    className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center text-slate-300"
                    title="Độ trễ giữa mỗi chương để tránh bị máy chủ website chặn IP"
                  />
                </div>
              </div>

              {/* Start Crawl CTA */}
              <button
                onClick={handleStartCrawl}
                disabled={isCrawling}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all"
              >
                {isCrawling ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Đang cào dữ liệu...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>Bắt đầu cào ({toChapter - fromChapter + 1} chương)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Active Crawl Progress & Live Logs */}
        {isCrawling && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">
                Tiến độ: {crawlProgress}% ({crawledChapters.length}/{toChapter - fromChapter + 1} chương)
              </span>
              <span className="text-amber-400 font-mono truncate max-w-xs">
                {currentChapterTitle}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${crawlProgress}%` }}
              />
            </div>

            {/* Terminal logs */}
            <div className="rounded-lg bg-black/60 p-3 font-mono text-[11px] text-slate-300 max-h-36 overflow-y-auto space-y-1 scrollbar-thin">
              {crawlLogs.map((log, index) => (
                <div
                  key={index}
                  className={
                    log.type === 'success'
                      ? 'text-emerald-400'
                      : log.type === 'error'
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }
                >
                  {log.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Finished Crawling Call-to-action */}
        {crawledNovelResult && !isCrawling && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-slate-950">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  Đã cào thành công {crawledChapters.length} chương vào Thư viện!
                </h4>
                <p className="text-xs text-emerald-300/80">
                  Dữ liệu đã được lưu trữ an toàn, sẵn sàng để dịch AI hoặc xuất file EPUB.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onGoToTranslate(crawledNovelResult)}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
              >
                <Sparkles className="h-4 w-4" />
                <span>Chuyển sang Dịch AI ngay</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
