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
import {
  inspectNovel,
  scrapeChapterContent,
  normalizeNovelUrl,
  areNovelsMatching,
  getCanonicalNovelKey,
} from './crawler-engine';
import { findPresetForUrl } from './preset-extractors';
import { cleanChapterTitle } from './chapter-utils';
import { serverStorage } from './server-storage';
import {
  saveSupabaseNovel,
  saveSupabaseChapter,
  fetchSupabaseApiKeys,
  isSupabaseConfigured,
} from './supabase';
import { translateChapter, translateNovelMetadata } from './gemini';

const JOBS_DIR = path.join(process.cwd(), '.data');
const JOBS_FILE = path.join(JOBS_DIR, 'background-jobs.json');

interface JobRuntimeControl {
  runId: string;
  abortController: AbortController;
  isPaused: boolean;
  pausePromiseResolver?: () => void;
  lastHeartbeat: number;
}

// Global runtime registry on server process
declare global {
  var __bgCrawlJobsMap: Map<string, BackgroundCrawlJob> | undefined;
  var __bgCrawlRuntimeControls: Map<string, JobRuntimeControl> | undefined;
  var __bgCrawlWatchdogStarted: boolean | undefined;
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

/**
 * Persist chapter items list for a specific job so it can be resumed even after server restarts
 */
function saveJobChapters(jobId: string, chapters: Array<{ number: number; title: string; url: string }>): void {
  try {
    ensureStorageDir();
    const filePath = path.join(JOBS_DIR, `${jobId}_chapters.json`);
    fs.writeFileSync(filePath, JSON.stringify(chapters), 'utf-8');
  } catch (e) {
    console.warn('[BackgroundCrawler] saveJobChapters error:', e);
  }
}

function loadJobChapters(jobId: string): Array<{ number: number; title: string; url: string }> | null {
  try {
    const filePath = path.join(JOBS_DIR, `${jobId}_chapters.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (e) {
    console.warn('[BackgroundCrawler] loadJobChapters error:', e);
  }
  return null;
}

function deleteJobChapters(jobId: string): void {
  try {
    const filePath = path.join(JOBS_DIR, `${jobId}_chapters.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // non-fatal
  }
}

function loadJobsFromDisk(): void {
  try {
    ensureStorageDir();
    if (fs.existsSync(JOBS_FILE)) {
      const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const now = Date.now();
        for (const job of list) {
          // If a job was left in 'running' state from days ago before server crash, mark it paused
          const lastActivity = new Date(job.updatedAt || job.createdAt || 0).getTime();
          if (job.status === 'running' && (now - lastActivity > 86400000 * 2)) {
            job.status = 'paused';
            appendLog(job, '⏸️ Tác vụ tạm dừng do máy chủ khởi động lại sau thời gian dài.', 'info');
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
 * Pause helper supporting cancellation check with progressive heartbeat ticks
 */
async function waitWithCheck(ms: number, signal: AbortSignal, onTick?: () => void): Promise<void> {
  if (signal.aborted) return;
  const startTime = Date.now();
  while (Date.now() - startTime < ms) {
    if (signal.aborted) throw new Error('ABORTED');
    if (onTick) onTick();
    const remain = ms - (Date.now() - startTime);
    const step = Math.min(1000, remain);
    await new Promise(resolve => setTimeout(resolve, step));
  }
}

/**
 * Execute the autonomous server crawl worker with bulletproof chapter isolation and heartbeat monitoring
 */
async function runBackgroundWorker(
  jobId: string,
  runId: string,
  targetChapterItems: Array<{ number: number; title: string; url: string }>,
  novelMeta: Novel,
  cookieConfig?: CookieConfig
): Promise<void> {
  const jobs = getJobsMap();
  const controls = getControlsMap();

  const job = jobs.get(jobId);
  const ctrl = controls.get(jobId);

  if (!job || !ctrl || ctrl.runId !== runId) return;

  const preset = findPresetForUrl(job.sourceUrl);
  const delay = Math.max(500, job.delayMs || 1000);

  appendLog(
    job,
    `🚀 Bắt đầu cào ngầm độc lập cho "${job.novelTitle}". Lượt này: ${targetChapterItems.length} chương (Chương ${targetChapterItems[0]?.number} ➜ ${targetChapterItems[targetChapterItems.length - 1]?.number}).`,
    'info'
  );

  if (isSupabaseConfigured()) {
    appendLog(job, '🔌 Đã kết nối Supabase: Từng chương sẽ được ghi nhận và đồng bộ trực tiếp vào cơ sở dữ liệu.', 'success');
  } else {
    appendLog(job, 'ℹ️ Dữ liệu được lưu an toàn vào bộ nhớ máy chủ.', 'info');
  }

  // Fetch active Gemini API keys
  let activeApiKeys: string[] = [];
  if (job.autoTranslate) {
    try {
      const keys = await fetchSupabaseApiKeys();
      activeApiKeys = keys
        .filter(k => k.isActive && k.status !== 'invalid')
        .map(k => k.key.trim())
        .filter(Boolean);
    } catch {
      // non-fatal
    }
    if (activeApiKeys.length > 0) {
      appendLog(job, `✨ Tính năng tự động dịch AI bật với ${activeApiKeys.length} khóa Gemini API luân phiên.`, 'info');
    } else {
      appendLog(job, '✨ Tính năng tự động dịch AI bật (dùng cấu hình server).', 'info');
    }

    // Automatically translate novel title, author, and description if needed
    try {
      const currentNovel = serverStorage.getNovel(job.novelId) || novelMeta;
      if (currentNovel) {
        const rawTitle = currentNovel.originalTitle || currentNovel.title || job.novelOriginalTitle || job.novelTitle;
        const rawDesc = currentNovel.description || '';
        const rawAuthor = currentNovel.author || '';

        const hasCjkTitle = /[\u4e00-\u9fa5\u3040-\u30ff]/.test(currentNovel.title);
        const hasCjkDesc = /[\u4e00-\u9fa5\u3040-\u30ff]/.test(rawDesc);
        const needsTranslation = hasCjkTitle || hasCjkDesc;

        if (needsTranslation) {
          appendLog(job, '📖 Đang tự động dịch tên truyện và văn án giới thiệu sang Tiếng Việt...', 'info');
          const metaTrans = await translateNovelMetadata({
            title: rawTitle,
            description: rawDesc,
            author: rawAuthor,
            genre: job.translationGenre || 'xianxia',
            apiKeys: activeApiKeys.length > 0 ? activeApiKeys : undefined,
          });

          let modified = false;
          if (metaTrans.translatedTitle && metaTrans.translatedTitle.trim()) {
            const newTitle = metaTrans.translatedTitle.trim();
            if (newTitle !== currentNovel.title) {
              if (!currentNovel.originalTitle) {
                currentNovel.originalTitle = rawTitle;
              }
              currentNovel.title = newTitle;
              job.novelTitle = newTitle;
              job.novelOriginalTitle = currentNovel.originalTitle;
              modified = true;
            }
          }

          if (metaTrans.translatedDescription && metaTrans.translatedDescription.trim()) {
            const newDesc = metaTrans.translatedDescription.trim();
            if (newDesc !== currentNovel.description) {
              currentNovel.description = newDesc;
              modified = true;
            }
          }

          if (metaTrans.translatedAuthor && metaTrans.translatedAuthor.trim()) {
            const newAuthor = metaTrans.translatedAuthor.trim();
            if (newAuthor !== currentNovel.author) {
              currentNovel.author = newAuthor;
              job.novelAuthor = newAuthor;
              modified = true;
            }
          }

          if (modified) {
            currentNovel.updatedAt = new Date().toISOString();
            serverStorage.saveNovel(currentNovel);
            if (isSupabaseConfigured()) {
              await saveSupabaseNovel(currentNovel);
            }
            persistJobsToDisk();
            appendLog(job, `✨ Đã dịch tên truyện: "${currentNovel.title}" | Tác giả: ${currentNovel.author}`, 'success');
          }
        }
      }
    } catch (metaErr) {
      console.warn('[BackgroundCrawler] translateNovelMetadata note:', metaErr);
    }
  }

  let consecutiveFailures = 0;

  try {
    for (let i = 0; i < targetChapterItems.length; i++) {
      ctrl.lastHeartbeat = Date.now();

      // 1. Check if cancelled
      if (ctrl.abortController.signal.aborted) {
        job.status = 'cancelled';
        job.updatedAt = new Date().toISOString();
        appendLog(job, '🛑 Tác vụ cào ngầm đã bị người dùng hủy bỏ.', 'warning');
        persistJobsToDisk();
        return;
      }

      // 2. Check if paused
      if (ctrl.isPaused) {
        job.status = 'paused';
        appendLog(job, `⏸️ Tác vụ tạm dừng tại chương ${job.currentChapterNumber || job.startChapterNumber}. Đang chờ tiếp tục...`, 'warning');
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
        ctrl.lastHeartbeat = Date.now();
        appendLog(job, '▶️ Tác vụ cào ngầm được tiếp tục.', 'info');
        persistJobsToDisk();
      }

      const item = targetChapterItems[i];
      job.currentChapterNumber = item.number;
      job.currentChapterTitle = item.title;
      job.updatedAt = new Date().toISOString();

      // Check if chapter already exists in local storage with valid content
      const existingChap = serverStorage.getChapter(job.novelId, item.number);
      const hasFullContent = Boolean(existingChap && existingChap.rawContent && existingChap.rawContent.trim().length > 50);

      // If already crawled and already translated (or autoTranslate is disabled)
      if (hasFullContent && (!job.autoTranslate || existingChap?.translationStatus === 'translated')) {
        job.completedChaptersCount++;
        persistJobsToDisk();
        appendLog(job, `⚡ Chương ${item.number} đã có sẵn nội dung (${existingChap?.wordCount || 0} từ). Tự động bỏ qua cào lại.`, 'info');
        continue;
      }

      // ISOLATED CHAPTER PROCESSING: An error on one chapter will NOT break the worker loop!
      try {
        appendLog(job, `⏳ [${job.completedChaptersCount + 1}/${job.totalChaptersToCrawl}] Đang cào: Chương ${item.number} - "${item.title}"...`, 'info');

        // Periodically refresh Gemini API keys every 20 chapters
        if (job.autoTranslate && (i % 20 === 0 || activeApiKeys.length === 0)) {
          try {
            const keys = await fetchSupabaseApiKeys();
            const refreshed = keys
              .filter(k => k.isActive && k.status !== 'invalid')
              .map(k => k.key.trim())
              .filter(Boolean);
            if (refreshed.length > 0) activeApiKeys = refreshed;
          } catch {
            // non-fatal
          }
        }

        let chapterData: { title: string; content: string; wordCount: number } | null = null;
        let crawlError: string | null = null;

        // If raw content already exists but needs AI translation:
        if (hasFullContent && existingChap?.rawContent) {
          chapterData = {
            title: existingChap.title,
            content: existingChap.rawContent,
            wordCount: existingChap.wordCount || 0,
          };
        } else {
          // Crawl with up to 3 attempts with progressive delay and active live heartbeats
          const scrapeTicker = setInterval(() => {
            ctrl.lastHeartbeat = Date.now();
          }, 2500);

          try {
            for (let attempt = 1; attempt <= 3; attempt++) {
              if (ctrl.abortController.signal.aborted) return;
              ctrl.lastHeartbeat = Date.now();
              try {
                chapterData = await scrapeChapterContent(item.url, cookieConfig, preset.config);
                ctrl.lastHeartbeat = Date.now();
                if (chapterData && chapterData.content) {
                  break;
                }
              } catch (err: unknown) {
                ctrl.lastHeartbeat = Date.now();
                crawlError = err instanceof Error ? err.message : String(err);
                if (attempt < 3) {
                  appendLog(job, `⚠️ Lần ${attempt}/3 lỗi bóc tách chương ${item.number}: ${crawlError}. Thử lại sau ${attempt * 2}s...`, 'warning');
                  await waitWithCheck(attempt * 2000, ctrl.abortController.signal, () => {
                    ctrl.lastHeartbeat = Date.now();
                  });
                }
              }
            }
          } finally {
            clearInterval(scrapeTicker);
            ctrl.lastHeartbeat = Date.now();
          }
        }

        if (!chapterData || !chapterData.content) {
          consecutiveFailures++;
          job.failedChaptersCount++;
          appendLog(job, `❌ Bỏ qua chương ${item.number} do không lấy được nội dung (${crawlError || 'Trống nội dung'}).`, 'error');

          // Resilient adaptive backoff: Never stop prematurely during long crawls
          if (consecutiveFailures >= 60) {
            appendLog(
              job,
              '⏸️ Đã gặp lỗi 60 chương liên tiếp do nguồn truyện tạm thời chặn hoặc hạn chế. Tác vụ được tạm dừng an toàn để không mất tiến độ. Bạn có thể kiểm tra Proxy / Cookie VIP và bấm "Tiếp tục" bất cứ lúc nào.',
              'warning'
            );
            job.status = 'paused';
            job.updatedAt = new Date().toISOString();
            persistJobsToDisk();
            return;
          } else if (consecutiveFailures >= 15 && consecutiveFailures % 15 === 0) {
            appendLog(job, `⚠️ ${consecutiveFailures} chương liên tiếp gặp lỗi, nguồn truyện đang hạn chế tần suất. Tự động tạm nghỉ 45 giây trước khi tự thử lại...`, 'warning');
            await waitWithCheck(45000, ctrl.abortController.signal, () => {
              ctrl.lastHeartbeat = Date.now();
            });
          } else if (consecutiveFailures >= 5 && consecutiveFailures % 5 === 0) {
            appendLog(job, '⚠️ Nguồn truyện phản hồi chậm hoặc giới hạn tần suất. Tạm nghỉ 15 giây trước khi tiếp tục...', 'warning');
            await waitWithCheck(15000, ctrl.abortController.signal, () => {
              ctrl.lastHeartbeat = Date.now();
            });
          }
          continue;
        }

        consecutiveFailures = 0;

        const rawTitle = chapterData.title || item.title;
        const cleanTitle = cleanChapterTitle(rawTitle, item.number) || `Chương ${item.number}`;
        const rawContent = chapterData.content;
        const wordCount = chapterData.wordCount || rawContent.split(/\s+/).filter(Boolean).length;

        let translatedTitle: string | undefined = existingChap?.translatedTitle;
        let translatedContent: string | undefined = existingChap?.translatedContent;
        let translationStatus: Chapter['translationStatus'] = existingChap?.translationStatus || 'pending';
        let translationError: string | undefined = undefined;

        // Auto-translate with Gemini AI if enabled, keeping watchdog heartbeat continuously warm
        if (job.autoTranslate && translationStatus !== 'translated') {
          ctrl.lastHeartbeat = Date.now();
          const heartbeatTimer = setInterval(() => {
            ctrl.lastHeartbeat = Date.now();
          }, 4000);

          try {
            const transResult = await translateChapter({
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
          } finally {
            clearInterval(heartbeatTimer);
            ctrl.lastHeartbeat = Date.now();
          }
        }

        // Construct Chapter Object
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
          createdAt: existingChap?.createdAt || new Date().toISOString(),
        };

        // Save directly to Supabase & local server storage
        let savedSupabase = false;
        try {
          savedSupabase = await saveSupabaseChapter(chapterObj, novelMeta);
        } catch (dbErr) {
          console.warn('[BackgroundCrawler] saveSupabaseChapter error:', dbErr);
        }

        try {
          serverStorage.saveChapter(chapterObj, novelMeta);
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

        // Rate-limiting delay between chapters with active heartbeat ticks
        if (i < targetChapterItems.length - 1) {
          await waitWithCheck(delay, ctrl.abortController.signal, () => {
            ctrl.lastHeartbeat = Date.now();
          });
        }
      } catch (chapterErr: unknown) {
        // Log individual chapter failure and continue loop safely
        const errMsg = chapterErr instanceof Error ? chapterErr.message : String(chapterErr);
        appendLog(job, `⚠️ Gặp lỗi khi xử lý chương ${item.number}: ${errMsg}. Bỏ qua và tiếp tục...`, 'warning');
        job.failedChaptersCount++;
        persistJobsToDisk();
        await waitWithCheck(2000, ctrl.abortController.signal, () => {
          ctrl.lastHeartbeat = Date.now();
        });
      }
    }

    // Completed successfully!
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
      appendLog(job, `💥 Tác vụ cào ngầm gặp sự cố: ${errMsg}`, 'error');
    }
    persistJobsToDisk();
  } finally {
    // Only delete from controls if this active worker is still the registered runId
    const active = controls.get(jobId);
    if (active && active.runId === runId) {
      controls.delete(jobId);
    }
  }
}

/**
 * Self-healing worker launcher that can start or resume any job from its current progress
 */
async function launchOrResumeWorker(job: BackgroundCrawlJob): Promise<boolean> {
  const controls = getControlsMap();
  const existingCtrl = controls.get(job.id);
  if (existingCtrl && !existingCtrl.abortController.signal.aborted && !existingCtrl.isPaused) {
    return true; // Already running in memory
  }

  // 1. Load target chapters list from disk
  let targetChapters = loadJobChapters(job.id);

  // If not on disk, re-inspect from source
  if (!targetChapters || targetChapters.length === 0) {
    try {
      const preset = findPresetForUrl(job.sourceUrl);
      const inspection = await inspectNovel(job.sourceUrl, job.cookieConfig, preset.config, {
        fetchAllPages: true,
        maxPages: 500,
      });
      if (inspection.chapters && inspection.chapters.length > 0) {
        targetChapters = inspection.chapters.filter(
          c => c.number >= job.startChapterNumber && c.number <= job.endChapterNumber
        );
        saveJobChapters(job.id, targetChapters);
      }
    } catch (e) {
      console.warn('[BackgroundCrawler] launchOrResumeWorker re-inspect note:', e);
    }
  }

  if (!targetChapters || targetChapters.length === 0) {
    job.status = 'failed';
    job.error = 'Không thể tải danh sách chương để tiếp tục cào.';
    appendLog(job, '❌ Không thể tải danh sách chương mục lục.', 'error');
    persistJobsToDisk();
    return false;
  }

  // Determine where to resume
  const resumeFromNumber = job.currentChapterNumber || job.startChapterNumber;
  const existingChap = serverStorage.getChapter(job.novelId, resumeFromNumber);
  const startNumber = (existingChap && existingChap.rawContent && existingChap.rawContent.length > 50)
    ? resumeFromNumber + 1
    : resumeFromNumber;

  const remaining = targetChapters.filter(c => c.number >= startNumber && c.number <= job.endChapterNumber);

  if (remaining.length === 0) {
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    appendLog(job, '🎉 Tất cả các chương trong phạm vi cào đã hoàn tất!', 'success');
    persistJobsToDisk();
    return true;
  }

  // Fetch or reconstruct novelMeta
  let novelMeta = serverStorage.getNovel(job.novelId);
  if (!novelMeta) {
    novelMeta = await serverStorage.getNovelByIdAsync(job.novelId);
  }
  if (!novelMeta) {
    novelMeta = {
      id: job.novelId,
      title: job.novelTitle,
      originalTitle: job.novelOriginalTitle,
      author: job.novelAuthor,
      coverUrl: job.novelCoverUrl || '',
      sourceUrl: job.sourceUrl,
      sourceDomain: job.sourceDomain,
      originalLanguage: 'zh',
      targetLanguage: 'vi',
      status: 'crawling',
      chaptersCount: 0,
      translatedChaptersCount: 0,
      translationGenre: job.translationGenre || 'xianxia',
      createdAt: job.createdAt,
      updatedAt: new Date().toISOString(),
    };
  }

  const runId = Math.random().toString(36).substring(2, 9);
  const abortController = new AbortController();
  controls.set(job.id, {
    runId,
    abortController,
    isPaused: false,
    lastHeartbeat: Date.now(),
  });

  job.status = 'running';
  job.updatedAt = new Date().toISOString();
  appendLog(job, `▶️ Khởi động lại tiến trình cào ngầm từ Chương ${remaining[0].number} (Còn ${remaining.length} chương)...`, 'info');
  persistJobsToDisk();

  // Run in detached background process
  runBackgroundWorker(job.id, runId, remaining, novelMeta, job.cookieConfig).catch(err => {
    console.error('[BackgroundCrawler] Uncaught worker error in launchOrResumeWorker:', err);
  });

  return true;
}

/**
 * Periodic Watchdog that verifies running jobs are actually alive and auto-heals stalled ones
 */
let watchdogInterval: NodeJS.Timeout | null = null;

function ensureWatchdog(): void {
  if (globalThis.__bgCrawlWatchdogStarted) return;
  globalThis.__bgCrawlWatchdogStarted = true;

  if (watchdogInterval) clearInterval(watchdogInterval);
  watchdogInterval = setInterval(() => {
    runWatchdogCheck().catch(e => console.warn('[BackgroundCrawler] Watchdog check note:', e));
  }, 10000); // Check every 10 seconds
}

async function runWatchdogCheck(): Promise<void> {
  const jobs = getJobsMap();
  const controls = getControlsMap();
  const now = Date.now();

  for (const job of jobs.values()) {
    if (job.status === 'running') {
      const ctrl = controls.get(job.id);

      // If marked running but no active controller exists (e.g. server restarted or background worker booted):
      if (!ctrl) {
        // Check if this is an ancient orphan job (> 48h old with 0 progress)
        const jobAge = now - new Date(job.createdAt).getTime();
        if (jobAge > 48 * 3600 * 1000 && job.completedChaptersCount === 0) {
          job.status = 'failed';
          job.error = 'Tác vụ cũ đã dừng trước đó.';
          appendLog(job, '⏹️ Tác vụ cũ đã được dọn dẹp an toàn.', 'info');
          persistJobsToDisk();
          continue;
        }

        appendLog(job, '🔄 Watchdog: Tự động khôi phục tiến trình cào ngầm sau khi máy chủ tái khởi động...', 'info');
        await launchOrResumeWorker(job);
        continue;
      }

      // If controller exists but heartbeat is older than 600s (10 minutes):
      if (ctrl.lastHeartbeat && now - ctrl.lastHeartbeat > 600000) {
        appendLog(job, '⚠️ Watchdog: Phát hiện lượt cào bị treo mạng. Đang tự động kết nối lại...', 'warning');
        try {
          ctrl.abortController.abort();
        } catch {
          // ignore
        }
        controls.delete(job.id);
        await launchOrResumeWorker(job);
      }
    }
  }
}

/**
 * Public Background Crawler Manager Interface
 */
export const backgroundCrawler = {
  /**
   * Start a new autonomous background crawl job with automatic novel deduplication
   */
  async startJob(params: CreateBackgroundJobParams): Promise<BackgroundCrawlJob> {
    ensureWatchdog();

    const {
      url,
      startChapter = 1,
      endChapter,
      maxChapters,
      autoTranslate = false,
      translationGenre = 'xianxia',
      delayMs = 1000,
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
      maxPages: 500,
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

    const targetChapters = allChapters.filter(
      c => c.number >= startNum && c.number <= endNum
    );

    if (targetChapters.length === 0) {
      throw new Error(`Không có chương nào trong khoảng từ chương ${startNum} đến chương ${endNum}`);
    }

    // 3. Resolve Novel Metadata & Check for Existing Novel (Deduplication)
    const domain = new URL(cleanUrl).hostname;
    const originalTitle = inspection.title || '';
    let finalTitle = inspection.title || 'Truyện không tên';
    let finalDescription = inspection.description || '';
    let finalAuthor = inspection.author || 'Khuyết danh';

    if (preferredNovelTitle && preferredNovelTitle.trim() && preferredNovelTitle !== inspection.title) {
      finalTitle = preferredNovelTitle.trim();
    }

    // Fetch active Gemini API keys
    let activeApiKeys: string[] = [];
    if (autoTranslate) {
      try {
        const keys = await fetchSupabaseApiKeys();
        activeApiKeys = keys
          .filter(k => k.isActive && k.status !== 'invalid')
          .map(k => k.key.trim())
          .filter(Boolean);
      } catch {
        // ignore
      }
    }

    // Auto-translate metadata if enabled
    if (autoTranslate && originalTitle) {
      try {
        const metaTrans = await translateNovelMetadata({
          title: originalTitle,
          description: finalDescription,
          author: finalAuthor,
          genre: translationGenre,
          apiKeys: activeApiKeys.length > 0 ? activeApiKeys : undefined,
        });
        if (metaTrans.translatedTitle && metaTrans.translatedTitle.trim()) {
          finalTitle = metaTrans.translatedTitle.trim();
        }
        if (metaTrans.translatedDescription && metaTrans.translatedDescription.trim()) {
          finalDescription = metaTrans.translatedDescription.trim();
        }
        if (metaTrans.translatedAuthor && metaTrans.translatedAuthor.trim()) {
          finalAuthor = metaTrans.translatedAuthor.trim();
        }
      } catch (metaErr) {
        console.warn('[BackgroundCrawler] translateNovelMetadata note:', metaErr);
      }
    }

    // DEDUPLICATION: Look up existing novels in serverStorage / Supabase
    let existingMatch: Novel | null = null;

    // Match 0: Direct novelId if provided
    if (params.novelId) {
      existingMatch = serverStorage.getNovel(params.novelId);
      if (!existingMatch) {
        existingMatch = await serverStorage.getNovelByIdAsync(params.novelId);
      }
    }

    // Match 1: Universal novel matching (Canonical URL key, Source URL, Original CJK Title, Translated Title)
    if (!existingMatch) {
      const existingNovels = await serverStorage.getAllNovelsAsync();
      const candidateToMatch = {
        sourceUrl: cleanUrl,
        title: finalTitle,
        originalTitle: originalTitle,
      };
      existingMatch = existingNovels.find(n => areNovelsMatching(n, candidateToMatch)) || null;
    }

    let novelId: string;
    let novelMeta: Novel;
    let isReusedNovel = false;

    if (existingMatch) {
      isReusedNovel = true;
      novelId = existingMatch.id;
      // Pre-hydrate all chapters of this novel from Supabase/disk into serverStorage memory
      try {
        await serverStorage.getChaptersAsync(novelId, true);
      } catch {
        // non-fatal
      }

      novelMeta = {
        ...existingMatch,
        title: finalTitle !== 'Truyện không tên' ? finalTitle : existingMatch.title,
        originalTitle: existingMatch.originalTitle || (originalTitle !== finalTitle ? originalTitle : undefined),
        author: finalAuthor !== 'Khuyết danh' ? finalAuthor : existingMatch.author,
        description: finalDescription || existingMatch.description,
        coverUrl: inspection.coverUrl || existingMatch.coverUrl,
        sourceUrl: existingMatch.sourceUrl || cleanUrl,
        sourceDomain: existingMatch.sourceDomain || domain,
        status: 'crawling',
        translationGenre: translationGenre || existingMatch.translationGenre || 'xianxia',
        cookieConfig: cookieConfig || existingMatch.cookieConfig,
        crawlerConfig: preset.config,
        updatedAt: new Date().toISOString(),
      };
    } else {
      novelId = `novel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      novelMeta = {
        id: novelId,
        title: finalTitle,
        originalTitle: originalTitle !== finalTitle ? originalTitle : undefined,
        author: finalAuthor,
        description: finalDescription,
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
    }

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
      novelAuthor: finalAuthor,
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

    if (isReusedNovel) {
      appendLog(
        job,
        `🔄 Nhận diện bộ truyện đã có trong thư viện: "${novelMeta.title}" (ID: ${novelMeta.id}). Tiến trình cào ngầm sẽ đồng bộ trực tiếp vào bộ truyện này mà không tạo bản sao trùng lặp.`,
        'success'
      );
    }

    // Persist chapters list to disk for this job
    saveJobChapters(jobId, targetChapters);

    const jobsMap = getJobsMap();
    jobsMap.set(jobId, job);
    persistJobsToDisk();

    // 5. Setup Runtime Control & Launch autonomous worker loop in background
    const runId = Math.random().toString(36).substring(2, 9);
    const controlsMap = getControlsMap();
    const abortController = new AbortController();
    controlsMap.set(jobId, {
      runId,
      abortController,
      isPaused: false,
      lastHeartbeat: Date.now(),
    });

    // Fire & forget async loop on Node server process
    runBackgroundWorker(jobId, runId, targetChapters, novelMeta, cookieConfig).catch(err => {
      console.error('[BackgroundCrawler] Uncaught worker error:', err);
    });

    return job;
  },

  /**
   * Get all background crawl jobs
   */
  getAllJobs(): BackgroundCrawlJob[] {
    ensureWatchdog();
    const map = getJobsMap();
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  /**
   * Get a specific job by ID
   */
  getJob(jobId: string): BackgroundCrawlJob | null {
    ensureWatchdog();
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

    if (job && (job.status === 'running' || ctrl)) {
      if (ctrl) {
        ctrl.isPaused = true;
      }
      job.status = 'paused';
      job.updatedAt = new Date().toISOString();
      appendLog(job, '⏸️ Đã nhận lệnh tạm dừng tác vụ.', 'info');
      persistJobsToDisk();
      return true;
    }
    return false;
  },

  /**
   * Resume a paused or failed background job
   */
  async resumeJob(jobId: string): Promise<boolean> {
    ensureWatchdog();
    const controls = getControlsMap();
    const ctrl = controls.get(jobId);
    const job = getJobsMap().get(jobId);

    if (!job) return false;

    // Case 1: Active in-memory worker that was paused
    if (ctrl && ctrl.isPaused) {
      ctrl.isPaused = false;
      ctrl.lastHeartbeat = Date.now();
      if (ctrl.pausePromiseResolver) {
        ctrl.pausePromiseResolver();
      }
      job.status = 'running';
      job.updatedAt = new Date().toISOString();
      appendLog(job, '▶️ Đã nhận lệnh tiếp tục cào.', 'info');
      persistJobsToDisk();
      return true;
    }

    // Case 2: Worker is not active in memory (server rebooted or process died)
    if (['paused', 'running', 'failed'].includes(job.status)) {
      return await launchOrResumeWorker(job);
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

    deleteJobChapters(jobId);

    const map = getJobsMap();
    const deleted = map.delete(jobId);
    if (deleted) {
      persistJobsToDisk();
    }
    return deleted;
  },
};

// Auto-activate background watchdog on server boot
try {
  ensureWatchdog();
} catch (e) {
  console.warn('[BackgroundCrawler] Watchdog startup note:', e);
}
