'use client';

import React, { useState } from 'react';
import { Novel, Chapter, CookieConfig, CrawlerConfig, TranslationGenre } from '@/types/novel';
import { SITE_PRESETS, findPresetForUrl } from '@/lib/preset-extractors';
import { cleanChapterTitle, cleanChapterContent, formatChapterDisplayTitle, sortChapters } from '@/lib/chapter-utils';
import { safeFetchJson } from '@/lib/safe-json';
import { getActiveApiKeyStrings, GEMINI_KEYS_CHANGED_EVENT } from '@/lib/api-key-storage';
import { 
  Compass, ShieldCheck, Key, RefreshCw, AlertCircle, Play, 
  Pause, CheckCircle2, ChevronDown, ChevronUp, Globe, FileText,
  Sliders, ArrowRight, Sparkles, ExternalLink, Languages, KeyRound
} from 'lucide-react';

interface CrawlerViewProps {
  onNovelCrawled: (novel: Novel, chapters: Chapter[]) => void;
  onGoToTranslate: (novel: Novel) => void;
  resumeNovel?: Novel | null;
  onClearResumeNovel?: () => void;
  onOpenApiKeyModal?: () => void;
}

export default function CrawlerView({
  onNovelCrawled,
  onGoToTranslate,
  resumeNovel,
  onClearResumeNovel,
  onOpenApiKeyModal,
}: CrawlerViewProps) {
  const [url, setUrl] = useState(resumeNovel?.sourceUrl || '');
  const [detectedPreset, setDetectedPreset] = useState<string>(() => 
    resumeNovel ? findPresetForUrl(resumeNovel.sourceUrl).id : 'generic'
  );
  
  // Cookie & Proxy Configuration
  const [showCookiePanel, setShowCookiePanel] = useState(false);
  const [cookieString, setCookieString] = useState(resumeNovel?.cookieConfig?.cookieString || '');
  const [userAgent, setUserAgent] = useState(resumeNovel?.cookieConfig?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  const [referer, setReferer] = useState(resumeNovel?.cookieConfig?.referer || '');
  const [customProxy, setCustomProxy] = useState(resumeNovel?.cookieConfig?.customProxy || '');

  // Live active Gemini keys count
  const [activeKeysCount, setActiveKeysCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return getActiveApiKeyStrings().length;
    }
    return 0;
  });

  React.useEffect(() => {
    const handler = () => setActiveKeysCount(getActiveApiKeyStrings().length);
    window.addEventListener(GEMINI_KEYS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(GEMINI_KEYS_CHANGED_EVENT, handler);
  }, []);

  // Pagination Configuration
  const [fetchAllPages, setFetchAllPages] = useState(true);
  const [maxPaginationPages, setMaxPaginationPages] = useState(500);

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
    totalPages?: number;
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

  // Auto-translate during crawl
  const [autoTranslateOnCrawl, setAutoTranslateOnCrawl] = useState(true);
  const [translateNovelTitle, setTranslateNovelTitle] = useState(true);
  const [translationGenre, setTranslationGenre] = useState<TranslationGenre>(() =>
    (resumeNovel?.translationGenre as TranslationGenre) || 'xianxia'
  );
  const [aiModel, setAiModel] = useState('gemini-3.1-flash-lite');
  const [isTranslatingMetadata, setIsTranslatingMetadata] = useState(false);
  const [translatedMetadata, setTranslatedMetadata] = useState<{
    originalTitle?: string;
    translatedTitle?: string;
    translatedAuthor?: string;
    translatedDescription?: string;
  } | null>(null);

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
      const { ok, data, error } = await safeFetchJson<any>('/api/crawler/test-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          cookieConfig: {
            cookieString,
            userAgent,
            referer: referer || undefined,
            customProxy: customProxy.trim() || undefined,
          },
        }),
      });

      if (!ok) throw new Error(error || data?.error || 'Lỗi kiểm tra cookie');
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
      customProxy: customProxy.trim() || undefined,
    };

    try {
      const { ok, data, error } = await safeFetchJson<any>('/api/crawler/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          cookieConfig,
          crawlerConfig: preset.config,
          fetchAllPages,
          maxPages: maxPaginationPages,
        }),
      });

      if (!ok || !data?.data) throw new Error(error || data?.error || 'Không thể trích xuất thông tin truyện');

      setInspectedNovel(data.data);
      setTranslatedMetadata(null);

      // Auto-detect recommended genre based on domain
      const checkUrl = url.trim().toLowerCase();
      if (checkUrl.includes('syosetu') || checkUrl.includes('kakuyomu')) {
        setTranslationGenre('lightnovel');
      } else if (checkUrl.includes('novelfull') || checkUrl.includes('royalroad')) {
        setTranslationGenre('webnovel');
      } else if (checkUrl.includes('69shuba') || checkUrl.includes('69shu') || checkUrl.includes('biquge') || checkUrl.includes('novel543')) {
        setTranslationGenre('xianxia');
      }

      if (data.data.chapters && data.data.chapters.length > 0) {
        if (resumeNovel) {
          const existingCount = resumeNovel.chaptersCount || 0;
          setFromChapter(existingCount + 1);
          setToChapter(Math.max(existingCount + 1, data.data.chapters.length));
        } else {
          setFromChapter(1);
          setToChapter(Math.min(data.data.chapters.length, 10));
        }
      }
    } catch (err: unknown) {
      setInspectError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInspecting(false);
    }
  };

  // Quick translate novel metadata directly in preview card
  const handleTranslateMetadataQuick = async () => {
    if (!inspectedNovel?.title) return;
    setIsTranslatingMetadata(true);
    try {
      const domain = new URL(url).hostname;
      let origLang: Novel['originalLanguage'] = 'zh';
      if (domain.includes('syosetu') || domain.includes('kakuyomu')) origLang = 'ja';
      else if (domain.includes('novelfull')) origLang = 'en';

      const { ok, data, error } = await safeFetchJson<any>('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'novel',
          title: inspectedNovel.title,
          author: inspectedNovel.author,
          description: inspectedNovel.description,
          sourceLang: origLang,
          targetLang: 'Tiếng Việt',
          genre: translationGenre,
          modelName: aiModel,
          apiKeys: getActiveApiKeyStrings(),
        }),
      });

      if (!ok) throw new Error(error || data?.error || 'Lỗi dịch tên truyện');

      if (data.data?.translatedTitle) {
        const transTitle = data.data.translatedTitle;
        const transAuthor = data.data.translatedAuthor || inspectedNovel.author;
        const transDesc = data.data.translatedDescription || inspectedNovel.description;

        setTranslatedMetadata({
          originalTitle: inspectedNovel.title,
          translatedTitle: transTitle,
          translatedAuthor: transAuthor,
          translatedDescription: transDesc,
        });

        setInspectedNovel(prev => prev ? {
          ...prev,
          title: transTitle,
          author: transAuthor,
          description: transDesc,
        } : prev);
      }
    } catch (err: unknown) {
      console.warn('Lỗi dịch metadata:', err);
    } finally {
      setIsTranslatingMetadata(false);
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
      customProxy: customProxy.trim() || undefined,
    };

    const preset = findPresetForUrl(url);
    const chaptersAccumulated: Chapter[] = [];
    const novelId = resumeNovel ? resumeNovel.id : `novel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 1. Khởi tạo & Lưu hồ sơ truyện vào Supabase / Server storage trước khi bắt đầu cào các chương
    const domain = new URL(url).hostname;
    let origLang: Novel['originalLanguage'] = 'zh';
    if (domain.includes('syosetu') || domain.includes('kakuyomu')) origLang = 'ja';
    else if (domain.includes('novelfull') || domain.includes('royalroad')) origLang = 'en';

    // 0. Nếu người dùng chọn dịch luôn cả tên truyện và thông tin giới thiệu
    let finalTitle = inspectedNovel.title;
    let finalAuthor = inspectedNovel.author;
    let finalDescription = inspectedNovel.description;
    let originalTitle = inspectedNovel.title;

    if (autoTranslateOnCrawl && translateNovelTitle) {
      if (translatedMetadata?.translatedTitle) {
        finalTitle = translatedMetadata.translatedTitle;
        if (translatedMetadata.translatedAuthor) finalAuthor = translatedMetadata.translatedAuthor;
        if (translatedMetadata.translatedDescription) finalDescription = translatedMetadata.translatedDescription;
        originalTitle = translatedMetadata.originalTitle || inspectedNovel.title;
      } else {
        setCrawlLogs(prev => [
          { text: `🤖 [AI Dịch] Đang dịch tiêu đề truyện "${inspectedNovel.title}" sang Tiếng Việt...`, type: 'info' },
          ...prev,
        ]);

        try {
          const { ok: metaOk, data: metaData } = await safeFetchJson<any>('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'novel',
              title: inspectedNovel.title,
              author: inspectedNovel.author,
              description: inspectedNovel.description,
              sourceLang: origLang,
              targetLang: 'Tiếng Việt',
              genre: translationGenre,
              modelName: aiModel,
              apiKeys: getActiveApiKeyStrings(),
            }),
          });

          if (metaOk && metaData?.data?.translatedTitle) {
            finalTitle = metaData.data.translatedTitle;
            if (metaData.data.translatedAuthor) finalAuthor = metaData.data.translatedAuthor;
            if (metaData.data.translatedDescription) finalDescription = metaData.data.translatedDescription;

            setTranslatedMetadata({
              originalTitle: inspectedNovel.title,
              translatedTitle: finalTitle,
              translatedAuthor: finalAuthor,
              translatedDescription: finalDescription,
            });

            setInspectedNovel(prev => prev ? {
              ...prev,
              title: finalTitle,
              author: finalAuthor,
              description: finalDescription,
            } : prev);

            setCrawlLogs(prev => [
              { text: `✨ [AI Dịch] Đã dịch tên truyện: "${originalTitle}" ➜ "${finalTitle}"`, type: 'success' },
              ...prev,
            ]);
          } else {
            setCrawlLogs(prev => [
              { text: `⚠️ Không dịch được tên truyện (${metaData?.error || 'lỗi máy chủ'}), giữ nguyên tên gốc`, type: 'info' },
              ...prev,
            ]);
          }
        } catch (metaErr: unknown) {
          const mMsg = metaErr instanceof Error ? metaErr.message : String(metaErr);
          setCrawlLogs(prev => [
            { text: `⚠️ Không dịch được tên truyện (${mMsg}), giữ nguyên tên gốc`, type: 'info' },
            ...prev,
          ]);
        }
      }
    }

    let currentNovel: Novel = resumeNovel ? {
      ...resumeNovel,
      title: finalTitle || resumeNovel.title,
      originalTitle: originalTitle !== finalTitle ? originalTitle : resumeNovel.originalTitle,
      author: finalAuthor || resumeNovel.author,
      description: finalDescription || resumeNovel.description,
      translationGenre: translationGenre || resumeNovel.translationGenre,
      cookieConfig,
      updatedAt: new Date().toISOString(),
    } : {
      id: novelId,
      title: finalTitle,
      originalTitle: originalTitle !== finalTitle ? originalTitle : undefined,
      author: finalAuthor,
      description: finalDescription,
      coverUrl: inspectedNovel.coverUrl,
      sourceUrl: url,
      sourceDomain: domain,
      originalLanguage: origLang,
      targetLanguage: 'vi',
      status: 'ongoing',
      chaptersCount: 0,
      translatedChaptersCount: 0,
      translationGenre: translationGenre,
      cookieConfig,
      crawlerConfig: preset.config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      if (resumeNovel) {
        await fetch(`/api/novels/${resumeNovel.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentNovel),
        });
      } else {
        await fetch('/api/novels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentNovel),
        });
      }
      onNovelCrawled(currentNovel, []);
      setCrawlLogs(prev => [
        { text: `⚡ Đã khởi tạo hồ sơ truyện trên Supabase & Thư viện. Bắt đầu cào${autoTranslateOnCrawl ? ' & dịch AI từng chương' : ' và import từng chương'}...`, type: 'info' },
        ...prev,
      ]);
    } catch (initErr) {
      console.warn('Lỗi khởi tạo novel:', initErr);
    }

    // 2. Vòng lặp cào từng chương & import ngay lập tức vào Supabase
    for (let i = 0; i < targetChapters.length; i++) {
      const item = targetChapters[i];
      const displayTitle = formatChapterDisplayTitle(item.number, item.title);
      setCurrentChapterTitle(displayTitle);
      
      setCrawlLogs(prev => [
        { text: `Đang cào ${displayTitle}...`, type: 'info' },
        ...prev.slice(0, 50),
      ]);

      try {
        const { ok: chapOk, data, error: chapError } = await safeFetchJson<any>('/api/crawler/chapter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: item.url,
            cookieConfig,
            crawlerConfig: preset.config,
          }),
        });

        if (!chapOk || !data?.data) throw new Error(chapError || data?.error || 'Lỗi bóc tách chương');

        const rawTitle = data.data.title || item.title;
        const cleanedTitle = cleanChapterTitle(rawTitle, item.number) || `Chương ${item.number}`;
        const cleanedContent = cleanChapterContent(data.data.content);

        let translatedTitle: string | undefined = undefined;
        let translatedContent: string | undefined = undefined;
        let translationStatus: Chapter['translationStatus'] = 'pending';
        let translatedAt: string | undefined = undefined;

        // >>> DỊCH NGAY BẰNG AI CHƯƠNG VỪA CÀO ĐƯỢC RỒI MỚI THÊM VÀO DATABASE <<<
        if (autoTranslateOnCrawl) {
          setCrawlLogs(prev => [
            { text: `🤖 [AI Dịch] Đang dịch ${displayTitle} sang Tiếng Việt (${translationGenre})...`, type: 'info' },
            ...prev.slice(0, 50),
          ]);

          try {
            const { ok: transOk, data: transData, error: transError } = await safeFetchJson<any>('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: cleanedTitle,
                content: cleanedContent,
                sourceLang: origLang,
                targetLang: 'Tiếng Việt',
                genre: translationGenre,
                modelName: aiModel,
                apiKeys: getActiveApiKeyStrings(),
              }),
            });

            if (transOk && transData?.data) {
              translatedTitle = cleanChapterTitle(transData.data.translatedTitle, item.number);
              translatedContent = transData.data.translatedContent;
              translationStatus = 'translated';
              translatedAt = new Date().toISOString();

              setCrawlLogs(prev => [
                { text: `✨ [AI Dịch] Đã dịch xong Chương ${item.number}: "${translatedTitle}"`, type: 'success' },
                ...prev.slice(0, 50),
              ]);
            } else {
              throw new Error(transError || transData?.error || 'AI dịch không trả về kết quả');
            }
          } catch (transErr: unknown) {
            const transMsg = transErr instanceof Error ? transErr.message : String(transErr);
            setCrawlLogs(prev => [
              { text: `⚠️ [AI Dịch] Lỗi dịch Chương ${item.number} (${transMsg}) → Tạm lưu bản gốc vào DB để không gián đoạn`, type: 'error' },
              ...prev.slice(0, 50),
            ]);
          }
        }

        const newChapter: Chapter = {
          id: `chap-${novelId}-${item.number}`,
          novelId,
          chapterNumber: item.number,
          title: cleanedTitle,
          translatedTitle,
          sourceUrl: item.url,
          rawContent: cleanedContent,
          translatedContent,
          translationStatus,
          translatedAt,
          wordCount: data.data.wordCount || cleanedContent.split(/\s+/).filter(Boolean).length,
          createdAt: new Date().toISOString(),
        };

        chaptersAccumulated.push(newChapter);
        // Tự động sắp xếp các chương đã cào theo đúng thứ tự tăng dần
        chaptersAccumulated.sort((a, b) => a.chapterNumber - b.chapterNumber);
        setCrawledChapters([...chaptersAccumulated]);

        // >>> IMPORT NGAY CHƯƠNG VỪA CÀO (VÀ ĐÃ DỊCH) VÀO SUPABASE & SERVER STORAGE <<<
        try {
          const saveRes = await safeFetchJson(`/api/novels/${novelId}/chapters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chapter: newChapter,
              novel: currentNovel,
            }),
          });

          if (saveRes.ok) {
            const isTrans = newChapter.translationStatus === 'translated';
            currentNovel = {
              ...currentNovel,
              chaptersCount: Math.max(currentNovel.chaptersCount || 0, chaptersAccumulated.length),
              translatedChaptersCount: chaptersAccumulated.filter(c => c.translationStatus === 'translated').length,
              updatedAt: new Date().toISOString(),
            };
            onNovelCrawled(currentNovel, chaptersAccumulated);

            setCrawlLogs(prev => [
              { 
                text: `⚡ [Supabase] Đã lưu Chương ${item.number}: "${isTrans ? newChapter.translatedTitle : cleanedTitle}" (${isTrans ? '✓ Đã dịch Tiếng Việt' : 'Bản gốc'}) vào Database`, 
                type: 'success' 
              },
              ...prev.slice(0, 50),
            ]);
          } else {
            setCrawlLogs(prev => [
              { text: `✓ Hoàn tất Chương ${item.number} (${data.data.wordCount} chữ)`, type: 'success' },
              ...prev.slice(0, 50),
            ]);
          }
        } catch (saveErr) {
          console.warn(`Lỗi lưu chương ${item.number} lên Supabase:`, saveErr);
          setCrawlLogs(prev => [
            { text: `✓ Đã cào Chương ${item.number} (${data.data.wordCount} chữ)`, type: 'success' },
            ...prev.slice(0, 50),
          ]);
        }
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

    // 3. Sau khi kết thúc, sắp xếp toàn bộ chương và cập nhật trạng thái hoàn tất
    chaptersAccumulated.sort((a, b) => a.chapterNumber - b.chapterNumber);
    const highestChapterNumber = Math.max(
      currentNovel.chaptersCount || 0,
      ...chaptersAccumulated.map(c => c.chapterNumber)
    );
    const translatedCount = chaptersAccumulated.filter(c => c.translationStatus === 'translated').length;

    const finalizedNovel: Novel = {
      ...currentNovel,
      chaptersCount: highestChapterNumber,
      translatedChaptersCount: translatedCount,
      cookieConfig,
      updatedAt: new Date().toISOString(),
    };

    try {
      await fetch(`/api/novels/${novelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalizedNovel),
      });
    } catch {
      // Non-fatal
    }

    setCrawledNovelResult(finalizedNovel);
    onNovelCrawled(finalizedNovel, chaptersAccumulated);

    setCrawlLogs(prev => [
      { 
        text: `🎉 Hoàn tất: Đã cào ${chaptersAccumulated.length} chương${translatedCount > 0 ? ` (${translatedCount} chương đã dịch AI)` : ''} và lưu vào cơ sở dữ liệu Supabase!`, 
        type: 'success' 
      },
      ...prev.slice(0, 50),
    ]);

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
        {/* Resume Mode Banner */}
        {resumeNovel && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 shadow-inner">
            <div className="flex items-start sm:items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">
                  Chế độ tiếp tục cào truyện: <span className="text-amber-300">{resumeNovel.title}</span>
                </div>
                <div className="text-[11px] text-amber-200/80 mt-0.5">
                  Thư viện hiện có <b>{resumeNovel.chaptersCount || 0} chương</b>. Khi bấm cào, các chương mới sẽ được thêm tiếp vào truyện và lưu tự động vào Supabase.
                </div>
              </div>
            </div>
            {onClearResumeNovel && (
              <button
                type="button"
                onClick={onClearResumeNovel}
                className="self-start sm:self-center shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                Hủy / Cào truyện khác
              </button>
            )}
          </div>
        )}

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
                placeholder="Ví dụ: https://truyenfull.io/dau-pha-thuong-khung/ hoặc https://www.69shuba.com/book/90442.htm"
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

          {/* Quick Preset Buttons & Pagination Options */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 font-medium">Mẫu thử nhanh:</span>
              <button
                type="button"
                onClick={() => handleUrlChange('https://truyenfull.io/dau-pha-thuong-khung/')}
                className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
              >
                🇻🇳 TruyenFull (Phân trang VN)
              </button>
              <button
                type="button"
                onClick={() => handleUrlChange('https://ncode.syosetu.com/n2267be/')}
                className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
              >
                🇯🇵 Syosetu (Nhật Bản)
              </button>
              <button
                type="button"
                onClick={() => handleUrlChange('https://www.69shuba.com/book/90442.htm')}
                className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
              >
                🇨🇳 69Shuba (Trung Raw)
              </button>
              <button
                type="button"
                onClick={() => handleUrlChange('https://www.xbiquge.info/135/135260/')}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 hover:border-amber-500/50 hover:text-amber-200 transition-colors"
              >
                🇨🇳 xBiquge (index_2.html)
              </button>
              <button
                type="button"
                onClick={() => handleUrlChange('https://www.novel543.com/0312506018/')}
                className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-[11px] text-teal-300 hover:border-teal-500/50 hover:text-teal-200 transition-colors"
              >
                🇹🇼 Novel543 (稷下書院)
              </button>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-3 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px]">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={fetchAllPages}
                  onChange={e => setFetchAllPages(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
                />
                <span>Cào mọi trang mục lục</span>
              </label>

              {fetchAllPages && (
                <div className="flex items-center gap-1 text-slate-400 border-l border-slate-800 pl-2">
                  <span>Tối đa:</span>
                  <select
                    value={maxPaginationPages}
                    onChange={e => setMaxPaginationPages(parseInt(e.target.value) || 500)}
                    className="bg-slate-900 text-white border border-slate-700 rounded px-1.5 py-0.5 text-[11px] focus:outline-none"
                  >
                    <option value={20}>20 trang (~1.000 ch)</option>
                    <option value={50}>50 trang (~2.500 ch)</option>
                    <option value={100}>100 trang (~5.000 ch)</option>
                    <option value={200}>200 trang (~10.000 ch)</option>
                    <option value={300}>300 trang (~15.000 ch)</option>
                    <option value={500}>500 trang (~25.000 ch - Khuyên dùng)</option>
                    <option value={1000}>1.000 trang (~50.000 ch)</option>
                  </select>
                </div>
              )}
            </div>
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

              {/* Custom Proxy / Cloudflare Bypasser */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Máy chủ Proxy trung gian (Tùy chọn - Hữu ích khi deploy lên Cloud/GitHub/Vercel):
                </label>
                <input
                  type="text"
                  value={customProxy}
                  onChange={e => setCustomProxy(e.target.value)}
                  placeholder="Ví dụ: https://my-proxy.com/?url={url} hoặc endpoint Scraper API"
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 px-3 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  ✓ Hệ thống đã tích hợp cơ chế <strong>Auto-Proxy Fallback</strong> (Jina Reader & CORS proxies) tự động kích hoạt khi các website Trung Quốc (69shuba, xbiquge...) kích hoạt Cloudflare 403 đối với server đám mây. Đồng thời tự động chuẩn hóa URL <code>69suba.com</code> → <code>69shuba.com</code>.
                </p>
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
                    {inspectedNovel.totalPages && inspectedNovel.totalPages > 1 && (
                      <span className="text-amber-400 font-medium"> (trên {inspectedNovel.totalPages} trang mục lục)</span>
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-white">
                    {inspectedNovel.title}
                  </h3>
                  {translatedMetadata?.translatedTitle && (
                    <span className="rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold">
                      ✨ Tên gốc: {translatedMetadata.originalTitle}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleTranslateMetadataQuick}
                    disabled={isTranslatingMetadata}
                    title="Dịch thử tên truyện và mô tả tác phẩm sang Tiếng Việt ngay"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {isTranslatingMetadata ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        <span>Đang dịch...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 text-amber-400" />
                        <span>{translatedMetadata ? 'Dịch lại tên' : 'Dịch thử tên & giới thiệu'}</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-300">
                  Tác giả: <span className="font-semibold text-amber-400">{inspectedNovel.author}</span>
                </p>
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                  {inspectedNovel.description}
                </p>

                {/* Resume helper details */}
                {resumeNovel && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400">Đã có trong thư viện:</span>
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-bold text-slate-200">
                      Chương 1 - {resumeNovel.chaptersCount || 0} ({resumeNovel.chaptersCount || 0} ch)
                    </span>
                    {inspectedNovel.chapters.length > (resumeNovel.chaptersCount || 0) ? (
                      <>
                        <span className="text-emerald-400 font-medium">• Có thêm:</span>
                        <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 font-bold">
                          {inspectedNovel.chapters.length - (resumeNovel.chaptersCount || 0)} chương mới
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const nextCh = (resumeNovel.chaptersCount || 0) + 1;
                            setFromChapter(nextCh);
                            setToChapter(inspectedNovel.chapters.length);
                          }}
                          className="ml-auto rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 transition-colors"
                        >
                          Chọn cào các chương mới ({inspectedNovel.chapters.length - (resumeNovel.chaptersCount || 0)} ch)
                        </button>
                      </>
                    ) : (
                      <span className="text-amber-400 text-xs italic">
                        (Thư viện đã có đủ tất cả chương hiện có trên web)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Auto-Translate on Crawl Options */}
            <div className="border-t border-slate-800/80 pt-4">
              <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900 to-indigo-950/40 p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoTranslateOnCrawl}
                      onChange={e => setAutoTranslateOnCrawl(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-950"
                    />
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      <span className="text-xs font-bold text-amber-200">
                        Dịch ngay bằng AI sau khi cào rồi mới lưu vào Database
                      </span>
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                        TỰ ĐỘNG
                      </span>
                    </div>
                  </label>

                  {autoTranslateOnCrawl && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer text-xs bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                        <input
                          type="checkbox"
                          checked={translateNovelTitle}
                          onChange={e => setTranslateNovelTitle(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
                        />
                        <span className="text-[11px] font-medium text-amber-100">
                          Dịch luôn cả tên truyện & tác giả sang Tiếng Việt
                        </span>
                      </label>

                      {onOpenApiKeyModal && (
                        <button
                          type="button"
                          onClick={onOpenApiKeyModal}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] font-semibold hover:bg-amber-500/20 transition-all cursor-pointer"
                          title="Quản lý Custom Gemini API Keys - Thêm nhiều key để xoay vòng"
                        >
                          <KeyRound className="h-3 w-3 text-amber-400" />
                          <span>Gemini Keys ({activeKeysCount})</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {autoTranslateOnCrawl && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-amber-500/10 text-xs">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-medium">Văn phong dịch:</label>
                      <select
                        value={translationGenre}
                        onChange={e => setTranslationGenre(e.target.value as TranslationGenre)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="xianxia">🇨🇳 Tiên Hiệp / Kiếm Hiệp (Hán-Việt chuẩn)</option>
                        <option value="modern">🏙️ Đô Thị / Ngôn Tình / Hiện Đại</option>
                        <option value="lightnovel">🇯🇵 Light Novel Nhật Bản</option>
                        <option value="webnovel">⚔️ Web Novel Tây Phương / LitRPG</option>
                        <option value="general">📖 Văn Học Tiêu Chuẩn</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-medium">Mô hình AI:</label>
                      <select
                        value={aiModel}
                        onChange={e => setAiModel(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="gemini-3.1-flash-lite">⚡ Gemini 3.1 Flash Lite (Khuyên dùng - Nhanh, ổn định)</option>
                        <option value="gemini-flash-latest">🌟 Gemini Flash Latest (Bản mới nhất)</option>
                        <option value="gemini-3.8-flash">⚡ Gemini 3.8 Flash (Tốc độ cao)</option>
                        <option value="gemini-3.1-pro-preview">🧠 Gemini 3.1 Pro (Phân tích dịch sâu)</option>
                      </select>
                    </div>

                    <div className="flex items-center">
                      <div className="text-[11px] text-amber-200/90 bg-amber-500/10 rounded-lg p-2 border border-amber-500/20 w-full leading-relaxed">
                        💡 Mỗi chương sau khi bóc tách sẽ được Gemini dịch toàn bộ tiêu đề & nội dung sang Tiếng Việt rồi mới lưu trực tiếp vào cơ sở dữ liệu Supabase.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Crawl Range Settings */}
            <div className="border-t border-slate-800/80 pt-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-slate-300 font-semibold">Phạm vi cào:</span>
                  <div className="flex items-center gap-1.5">
                    <label className="text-slate-400">Từ:</label>
                    <input
                      type="number"
                      min={1}
                      max={inspectedNovel.chapters.length}
                      value={fromChapter}
                      onChange={e => setFromChapter(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 sm:w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center font-bold text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="text-slate-400">Đến:</label>
                    <input
                      type="number"
                      min={fromChapter}
                      max={inspectedNovel.chapters.length}
                      value={toChapter}
                      onChange={e => setToChapter(Math.min(inspectedNovel.chapters.length, parseInt(e.target.value) || 1))}
                      className="w-20 sm:w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center font-bold text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  {/* Quick range selector buttons */}
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        setFromChapter(1);
                        setToChapter(inspectedNovel.chapters.length);
                      }}
                      className="rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2 py-1 transition-colors"
                      title="Chọn tất cả các chương tìm thấy"
                    >
                      Tất cả ({inspectedNovel.chapters.length})
                    </button>
                    {inspectedNovel.chapters.length > 50 && (
                      <button
                        type="button"
                        onClick={() => setToChapter(Math.min(inspectedNovel.chapters.length, fromChapter + 49))}
                        className="rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white px-1.5 py-1 transition-colors"
                      >
                        +50
                      </button>
                    )}
                    {inspectedNovel.chapters.length > 100 && (
                      <button
                        type="button"
                        onClick={() => setToChapter(Math.min(inspectedNovel.chapters.length, fromChapter + 99))}
                        className="rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white px-1.5 py-1 transition-colors"
                      >
                        +100
                      </button>
                    )}
                    {inspectedNovel.chapters.length > 500 && (
                      <button
                        type="button"
                        onClick={() => setToChapter(Math.min(inspectedNovel.chapters.length, fromChapter + 499))}
                        className="rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white px-1.5 py-1 transition-colors"
                      >
                        +500
                      </button>
                    )}
                    {inspectedNovel.chapters.length > 1000 && (
                      <button
                        type="button"
                        onClick={() => setToChapter(Math.min(inspectedNovel.chapters.length, fromChapter + 999))}
                        className="rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white px-1.5 py-1 transition-colors"
                      >
                        +1000
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="text-slate-400">Giãn cách:</label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={200}
                    value={delayMs}
                    onChange={e => setDelayMs(parseInt(e.target.value) || 0)}
                    className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center text-slate-300"
                    title="Độ trễ (ms) giữa mỗi chương để tránh bị máy chủ website chặn IP"
                  />
                  <span className="text-slate-500">ms</span>
                </div>
              </div>

              {/* Start Crawl CTA */}
              <div className="flex justify-end pt-1">
                <button
                  onClick={handleStartCrawl}
                  disabled={isCrawling}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isCrawling ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>{autoTranslateOnCrawl ? 'Đang cào & dịch AI...' : 'Đang cào dữ liệu...'}</span>
                    </>
                  ) : (
                    <>
                      {autoTranslateOnCrawl ? (
                        <Sparkles className="h-4 w-4 fill-current text-slate-950" />
                      ) : (
                        <Play className="h-4 w-4 fill-current" />
                      )}
                      <span>
                        {autoTranslateOnCrawl
                          ? `Cào & Dịch AI ngay (${toChapter - fromChapter + 1} chương)`
                          : `Bắt đầu cào (${toChapter - fromChapter + 1} chương)`}
                      </span>
                    </>
                  )}
                </button>
              </div>
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
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 shrink-0">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">
                    {resumeNovel ? `Đã cào thêm ${crawledChapters.length} chương mới!` : `Đã cào thành công ${crawledChapters.length} chương!`}
                  </h4>
                  <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold">
                    ✓ Đã lưu vào Supabase
                  </span>
                  {(crawledNovelResult.translatedChaptersCount || 0) > 0 && (
                    <span className="rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold">
                      ✨ Đã dịch {crawledNovelResult.translatedChaptersCount} chương
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-300/80 mt-0.5">
                  Bộ truyện <b>&ldquo;{crawledNovelResult.title}&rdquo;</b> hiện có <b>{crawledNovelResult.chaptersCount} chương</b> (trong đó <b>{crawledNovelResult.translatedChaptersCount || 0} chương đã dịch Tiếng Việt</b>) đã được đồng bộ vào cơ sở dữ liệu Supabase.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onGoToTranslate(crawledNovelResult)}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
              >
                <Sparkles className="h-4 w-4" />
                <span>Xem & Đọc bản dịch</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
