import fs from 'fs';
import path from 'path';
import {
  BackgroundCrawlJob,
  BackgroundJobLog,
  BackgroundJobStatus,
  Chapter,
  CookieConfig,
  CreateBackgroundJobParams,
  Novel,
  TranslationGenre,
} from '@/types/novel';
import { inspectNovel, scrapeChapterContent } from './crawler-engine';
import { findPresetForUrl } from './preset-extractors';
import { cleanChapterTitle } from './chapter-utils';
import { serverStorage } from './server-storage';
import {
  saveSupabaseNovel,
  saveSupabaseChapter,
  fetchSupabaseApiKeys,
  isSupabaseConfigured,
} from './supabase';
import { translateNovelContent, translateNovelMetadata } from './gemini';

const JOBS_DIR = path.join(process.cwd(), '.data');
const JOBS_FILE = path.join(JOBS_DIR, 'background-jobs.json');

interface JobRuntimeControl {
  abortController: AbortController;
  isPaused: boolean;
  pausePromiseResolver?: () => void;
}

// Global runtime registry on server process
declare global {
  var __bgCrawlJobsMap: Map<string, BackgroundCrawlJob> | undefined;
  var __bgCrawlRuntimeControls: Map<string, JobRuntimeControl> | undefined;
}

function getJobsMap(): Map<string, BackgroundCrawlJob> {
  if (!globalThis.__bgCrawlJobsMap) {
    globalThis.__bgCrawlJobsMap = new Map<string, BackgroundCrawlJob>();
    loadJobsFromDisk();
  }
  return globalThis.__bgCrawlJobsMap;
}

function getControlsMap(): Map<string, JobRuntimeControl> {
  if (!globalThis.__bgCrawlRuntimeControls) {
    globalThis.__bgCrawlRuntimeControls = new Map<string, JobRuntimeControl>();
  }
  return globalThis.__bgCrawlRuntimeControls;
}

function ensureStorageDir(): void {
  try {
    if (!fs.existsSync(JOBS_DIR)) {
      fs.mkdirSync(JOBS_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[BackgroundCrawler] ensureStorageDir error:', err);
  }
}

function loadJobsFromDisk(): void {
  try {
    ensureStorageDir();
    if (fs.existsSync(JOBS_FILE)) {
      const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const job of list) {
          // If server restarted while a job was marked 'running', mark it as 'paused' so user can resume
          if (job.status === 'running') {
            job.status = 'paused';
            job.logs = job.logs || [];
            job.logs.unshift({
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString(),
              text: '⚠️ Máy chủ vừa khởi động lại, tác vụ được tạm dừng an toàn. Bạn có thể bấm "Tiếp tục" để cào tiếp.',
              type: 'warning',
            });
          }
          globalThis.__bgCrawlJobsMap?.set(job.id, job);
        }
      }
    }
  } catch (err) {
    console.warn('[BackgroundCrawler] loadJobsFromDisk error:', err);
  }
}

function persistJobsToDisk(): void {
  try {
    ensureStorageDir();
    const map = getJobsMap();
    const list = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    fs.writeFileSync(JOBS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[BackgroundCrawler] persistJobsToDisk error:', err);
  }
}

function appendLog(
  job: BackgroundCrawlJob,
  text: string,
  type: BackgroundJobLog['type'] = 'info'
): void {
  const log: BackgroundJobLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    text,
    type,
  };
  job.logs = job.logs || [];
  job.logs.unshift(log);
  if (job.logs.length > 250) {
    job.logs = job.logs.slice(0, 250);
  }
  job.updatedAt = new Date().toISOString();
  persistJobsToDisk();
}

/**
 * Pause helper supporting cancellation check
 */
async function waitWithCheck(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('ABORTED'));
    };

    signal.addEventListener('abort', onAbort);
  });
}

/**
 * Execute the autonomous server crawl worker
 */
async function runBackgroundWorker(
  jobId: string,
  targetChapterItems: Array<{ number: number; title: string; url: string }>,
  novelMeta: Novel,
  cookieConfig?: CookieConfig
): Promise<void> {
  const jobs = getJobsMap();
  const controls = getControlsMap();

  const job = jobs.get(jobId);
  const ctrl = controls.get(jobId);

  if (!job || !ctrl) return;

  const preset = findPresetForUrl(job.sourceUrl);
  const delay = Math.max(500, job.delayMs || 1200);

  appendLog(
    job,
    `🚀 Máy chủ Node.js bắt đầu cào ngầm độc lập cho "${job.novelTitle}". Tổng cộng: ${targetChapterItems.length} chương (Từ ch. ${job.startChapterNumber} đến ch. ${job.endChapterNumber}).`,
    'info'
  );

  if (isSupabaseConfigured()) {
    appendLog(job, '🔌 Đã kết nối Supabase: Toàn bộ chương sẽ được lưu tức thời vào cơ sở dữ liệu Supabase.', 'success');
  } else {
    appendLog(job, 'ℹ️ Supabase chưa cấu hình biến môi trường, dữ liệu sẽ được lưu an toàn vào bộ nhớ máy chủ cục bộ.', 'info');
  }

  // Fetch active Gemini API keys once for key rotation
  let activeApiKeys: string[] = [];
  if (job.autoTranslate) {
    try {
      const keys = await fetchSupabaseApiKeys();
      activeApiKeys = keys
        .filter(k => k.isActive && k.status !== 'invalid')
        .map(k => k.key.trim())
        .filter(Boolean);
    } catch {
      // ignore
    }
    if (activeApiKeys.length > 0) {
      appendLog(job, `✨ Tính năng tự động dịch AI được bật với ${activeApiKeys.length} khóa Gemini API luân phiên.`, 'info');
    } else {
      appendLog(job, '✨ Tính năng tự động dịch AI được bật (sử dụng cấu hình Gemini của máy chủ).', 'info');
    }
  }

  try {
    for (let i = 0; i < targetChapterItems.length; i++) {
      // 1. Check if cancelled
      if (ctrl.abortController.signal.aborted) {
        job.status = 'cancelled';
        job.updatedAt = new Date().toISOString();
        appendLog(job, '🛑 Tác vụ cào ngầm đã bị người dùng hủy bỏ.', 'warning');
        persistJobsToDisk();
        return;
      }

      // 2. Check if paused - wait until unpaused
      if (ctrl.isPaused) {
        job.status = 'paused';
        appendLog(job, `⏸️ Tác vụ cào ngầm tạm dừng tại chương ${job.currentChapterNumber || job.startChapterNumber}. Đang chờ tiếp tục...`, 'warning');
        persistJobsToDisk();

        while (ctrl.isPaused) {
          if (ctrl.abortController.signal.aborted) {
            job.status = 'cancelled';
            persistJobsToDisk();
            return;
          }
          await new Promise<void>(resolve => {
            ctrl.pausePromiseResolver = resolve;
            setTimeout(resolve, 1000);
          });
        }

        job.status = 'running';
        appendLog(job, '▶️ Tác vụ cào ngầm được tiếp tục.', 'info');
        persistJobsToDisk();
      }

      const item = targetChapterItems[i];
      job.currentChapterNumber = item.number;
      job.currentChapterTitle = item.title;
      job.updatedAt = new Date().toISOString();
      persistJobsToDisk();

      appendLog(job, `⏳ [${i + 1}/${targetChapterItems.length}] Đang cào: Chương ${item.number} - "${item.title}"...`, 'info');

      // 3. Crawl chapter with retry mechanism (up to 3 attempts)
      let chapterData: { title: string; content: string; wordCount: number } | null = null;
      let crawlError: string | null = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        if (ctrl.abortController.signal.aborted) return;
        try {
          chapterData = await scrapeChapterContent(item.url, cookieConfig, preset.config);
          if (chapterData && chapterData.content) {
            break;
          }
        } catch (err: unknown) {
          crawlError = err instanceof Error ? err.message : String(err);
          if (attempt < 3) {
            appendLog(job, `⚠️ Lần ${attempt}/3 lỗi bóc tách chương ${item.number}: ${crawlError}. Đang thử lại sau ${attempt}s...`, 'warning');
            await waitWithCheck(attempt * 1000, ctrl.abortController.signal);
          }
        }
      }

      if (!chapterData || !chapterData.content) {
        job.failedChaptersCount++;
        appendLog(job, `❌ Bỏ qua chương ${item.number} do không lấy được nội dung sau 3 lần thử (${crawlError || 'Trống nội dung'}).`, 'error');
        continue;
      }

      const rawTitle = chapterData.title || item.title;
      const cleanTitle = cleanChapterTitle(rawTitle, item.number) || `Chương ${item.number}`;
      const rawContent = chapterData.content;
      const wordCount = chapterData.wordCount || rawContent.split(/\s+/).filter(Boolean).length;

      let translatedTitle: string | undefined = undefined;
      let translatedContent: string | undefined = undefined;
      let translationStatus: Chapter['translationStatus'] = 'pending';
      let translationError: string | undefined = undefined;

      // 4. Auto-translate with Gemini AI if enabled
      if (job.autoTranslate) {
        try {
          const transResult = await translateNovelContent({
            title: cleanTitle,
            content: rawContent,
            genre: job.translationGenre || 'xianxia',
            apiKeys: activeApiKeys.length > 0 ? activeApiKeys : undefined,
          });
          translatedTitle = transResult.translatedTitle;
          translatedContent = transResult.translatedContent;
          translationStatus = 'translated';
          appendLog(job, `✨ Đã dịch AI: "${cleanTitle}" ➜ "${translatedTitle || cleanTitle}" (${transResult.keyUsed || 'Gemini'})`, 'info');
        } catch (transErr: unknown) {
          translationStatus = 'error';
          translationError = transErr instanceof Error ? transErr.message : String(transErr);
          appendLog(job, `⚠️ Lỗi dịch AI chương ${item.number}: ${translationError}. Vẫn lưu bản raw gốc.`, 'warning');
        }
      }

      // 5. Construct Chapter Object
      const chapterObj: Chapter = {
        id: `chap_${job.novelId}_${item.number}`,
        novelId: job.novelId,
        chapterNumber: item.number,
        title: cleanTitle,
        translatedTitle,
        sourceUrl: item.url,
        rawContent,
        translatedContent,
        translationStatus,
        translationError,
        translatedAt: translationStatus === 'translated' ? new Date().toISOString() : undefined,
        wordCount,
        createdAt: new Date().toISOString(),
      };

      // 6. Save chapter directly to Supabase & local server storage
      let savedSupabase = false;
      try {
        savedSupabase = await saveSupabaseChapter(chapterObj, novelMeta);
      } catch (dbErr) {
        console.warn('[BackgroundCrawler] saveSupabaseChapter error:', dbErr);
      }

      try {
        serverStorage.saveChapter(job.novelId, chapterObj);
      } catch (localErr) {
        console.warn('[BackgroundCrawler] local saveChapter error:', localErr);
      }

      job.completedChaptersCount++;
      const percent = Math.round((job.completedChaptersCount / job.totalChaptersToCrawl) * 100);
      const storageBadge = savedSupabase ? ' [Supabase ✓]' : ' [Local ✓]';

      appendLog(
        job,
        `✅ Hoàn tất Chương ${item.number} (${wordCount} từ)${storageBadge}. Tiến độ: ${job.completedChaptersCount}/${job.totalChaptersToCrawl} (${percent}%)`,
        'success'
      );

      persistJobsToDisk();

      // 7. Rate-limiting delay between chapters
      if (i < targetChapterItems.length - 1) {
        await waitWithCheck(delay, ctrl.abortController.signal);
      }
    }

    // 8. Completed successfully!
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    appendLog(
      job,
      `🎉 HOÀN THÀNH TOÀN BỘ TÁC VỤ CÀO NGẦM! Đã bóc tách thành công ${job.completedChaptersCount}/${job.totalChaptersToCrawl} chương (Thất bại: ${job.failedChaptersCount}) và đồng bộ vào Supabase.`,
      'success'
    );

    // Refresh novel count in Supabase
    try {
      const refreshed = serverStorage.getNovel(job.novelId);
      if (refreshed) {
        await saveSupabaseNovel(refreshed);
      }
    } catch {
      // non-fatal
    }

    persistJobsToDisk();
  } catch (loopErr: unknown) {
    if (ctrl.abortController.signal.aborted) {
      job.status = 'cancelled';
      appendLog(job, '🛑 Tác vụ cào ngầm đã bị hủy.', 'warning');
    } else {
      job.status = 'failed';
      const errMsg = loopErr instanceof Error ? loopErr.message : String(loopErr);
      job.error = errMsg;
      appendLog(job, `💥 Tác vụ cào ngầm gặp lỗi nghiêm trọng: ${errMsg}`, 'error');
    }
    persistJobsToDisk();
  } finally {
    controls.delete(jobId);
  }
}

/**
 * Public Background Crawler Manager Interface
 */
export const backgroundCrawler = {
  /**
   * Start a new autonomous background crawl job
   */
  async startJob(params: CreateBackgroundJobParams): Promise<BackgroundCrawlJob> {
    const {
      url,
      startChapter = 1,
      endChapter,
      maxChapters,
      autoTranslate = false,
      translationGenre = 'xianxia',
      delayMs = 1200,
      cookieConfig,
      preferredNovelTitle,
    } = params;

    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('URL truyện không hợp lệ');
    }

    const cleanUrl = url.trim();
    const preset = findPresetForUrl(cleanUrl);

    // 1. Inspect source catalog to get list of chapters and metadata
    const inspection = await inspectNovel(cleanUrl, cookieConfig, preset.config, {
      fetchAllPages: true,
      maxPages: 150,
    });

    if (!inspection.chapters || inspection.chapters.length === 0) {
      throw new Error('Không tìm thấy danh sách chương nào từ URL đã cung cấp.');
    }

    const allChapters = inspection.chapters;
    const totalAvailable = allChapters.length;

    // 2. Calculate Chapter Range
    const startNum = Math.max(1, startChapter);
    let endNum = totalAvailable;

    if (typeof endChapter === 'number' && endChapter > 0) {
      endNum = Math.min(totalAvailable, endChapter);
    } else if (typeof maxChapters === 'number' && maxChapters > 0) {
      endNum = Math.min(totalAvailable, startNum + maxChapters - 1);
    }

    if (startNum > endNum) {
      throw new Error(`Khoảng chương không hợp lệ: Từ chương ${startNum} đến chương ${endNum}`);
    }

    // Filter chapters falling within [startNum, endNum]
    const targetChapters = allChapters.filter(
      c => c.number >= startNum && c.number <= endNum
    );

    if (targetChapters.length === 0) {
      throw new Error(`Không có chương nào trong khoảng từ chương ${startNum} đến chương ${endNum}`);
    }

    // 3. Resolve Novel Metadata & ID
    const domain = new URL(cleanUrl).hostname;
    let finalTitle = preferredNovelTitle || inspection.title || 'Truyện không tên';
    const originalTitle = inspection.title || '';

    // If auto-translate is enabled, translate metadata title to Vietnamese
    if (autoTranslate && originalTitle) {
      try {
        const metaTrans = await translateNovelMetadata({
          title: originalTitle,
          description: inspection.description,
          author: inspection.author,
          genre: translationGenre,
        });
        if (metaTrans.translatedTitle) {
          finalTitle = metaTrans.translatedTitle;
        }
      } catch {
        // non-fatal
      }
    }

    const novelId = `novel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const novelMeta: Novel = {
      id: novelId,
      title: finalTitle,
      originalTitle: originalTitle !== finalTitle ? originalTitle : undefined,
      author: inspection.author || 'Khuyết danh',
      description: inspection.description || '',
      coverUrl: inspection.coverUrl || '',
      sourceUrl: cleanUrl,
      sourceDomain: domain,
      originalLanguage: preset.id === 'syosetu' ? 'ja' : 'zh',
      targetLanguage: 'vi',
      status: 'crawling',
      chaptersCount: 0,
      translatedChaptersCount: 0,
      translationGenre,
      cookieConfig,
      crawlerConfig: preset.config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save initial novel to local server storage & Supabase
    try {
      serverStorage.saveNovel(novelMeta);
    } catch {
      // non-fatal
    }
    try {
      await saveSupabaseNovel(novelMeta);
    } catch {
      // non-fatal
    }

    // 4. Create Job Record
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const job: BackgroundCrawlJob = {
      id: jobId,
      novelId,
      novelTitle: finalTitle,
      novelOriginalTitle: originalTitle !== finalTitle ? originalTitle : undefined,
      novelAuthor: novelMeta.author,
      novelCoverUrl: novelMeta.coverUrl,
      sourceUrl: cleanUrl,
      sourceDomain: domain,
      startChapterNumber: startNum,
      endChapterNumber: endNum,
      totalChaptersToCrawl: targetChapters.length,
      completedChaptersCount: 0,
      failedChaptersCount: 0,
      currentChapterNumber: startNum,
      currentChapterTitle: targetChapters[0].title,
      status: 'running',
      autoTranslate,
      translationGenre,
      delayMs,
      cookieConfig,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs: [],
    };

    const jobsMap = getJobsMap();
    jobsMap.set(jobId, job);
    persistJobsToDisk();

    // 5. Setup Runtime Control & Launch autonomous worker loop in background
    const controlsMap = getControlsMap();
    const abortController = new AbortController();
    controlsMap.set(jobId, {
      abortController,
      isPaused: false,
    });

    // Fire & forget async loop on Node server process
    runBackgroundWorker(jobId, targetChapters, novelMeta, cookieConfig).catch(err => {
      console.error('[BackgroundCrawler] Uncaught worker error:', err);
    });

    return job;
  },

  /**
   * Get all background crawl jobs
   */
  getAllJobs(): BackgroundCrawlJob[] {
    const map = getJobsMap();
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  /**
   * Get a specific job by ID
   */
  getJob(jobId: string): BackgroundCrawlJob | null {
    const map = getJobsMap();
    return map.get(jobId) || null;
  },

  /**
   * Pause a running background job
   */
  pauseJob(jobId: string): boolean {
    const controls = getControlsMap();
    const ctrl = controls.get(jobId);
    const job = getJobsMap().get(jobId);

    if (ctrl && job && job.status === 'running') {
      ctrl.isPaused = true;
      job.status = 'paused';
      job.updatedAt = new Date().toISOString();
      appendLog(job, '⏸️ Đã nhận lệnh tạm dừng tác vụ.', 'info');
      persistJobsToDisk();
      return true;
    }
    return false;
  },

  /**
   * Resume a paused background job
   */
  resumeJob(jobId: string): boolean {
    const controls = getControlsMap();
    const ctrl = controls.get(jobId);
    const job = getJobsMap().get(jobId);

    if (ctrl && job && job.status === 'paused') {
      ctrl.isPaused = false;
      if (ctrl.pausePromiseResolver) {
        ctrl.pausePromiseResolver();
      }
      job.status = 'running';
      job.updatedAt = new Date().toISOString();
      appendLog(job, '▶️ Đã nhận lệnh tiếp tục cào.', 'info');
      persistJobsToDisk();
      return true;
    }
    return false;
  },

  /**
   * Cancel a running or paused background job
   */
  cancelJob(jobId: string): boolean {
    const controls = getControlsMap();
    const ctrl = controls.get(jobId);
    const job = getJobsMap().get(jobId);

    if (job) {
      if (ctrl) {
        ctrl.abortController.abort();
      }
      job.status = 'cancelled';
      job.updatedAt = new Date().toISOString();
      appendLog(job, '🛑 Đã hủy tác vụ cào ngầm theo yêu cầu của người dùng.', 'warning');
      persistJobsToDisk();
      return true;
    }
    return false;
  },

  /**
   * Delete a background job from registry and disk
   */
  deleteJob(jobId: string): boolean {
    const controls = getControlsMap();
    const ctrl = controls.get(jobId);
    if (ctrl) {
      ctrl.abortController.abort();
      controls.delete(jobId);
    }

    const map = getJobsMap();
    const deleted = map.delete(jobId);
    if (deleted) {
      persistJobsToDisk();
    }
    return deleted;
  },
};
