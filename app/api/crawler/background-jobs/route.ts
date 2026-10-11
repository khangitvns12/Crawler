import { NextRequest, NextResponse } from 'next/server';
import { backgroundCrawler } from '@/lib/background-crawler';
import { CreateBackgroundJobParams } from '@/types/novel';

/**
 * GET /api/crawler/background-jobs
 * Retrieve list of all autonomous server background crawl jobs
 */
export async function GET() {
  try {
    const jobs = backgroundCrawler.getAllJobs();
    const activeCount = jobs.filter(j => j.status === 'running').length;
    return NextResponse.json({
      success: true,
      data: jobs,
      activeCount,
      totalCount: jobs.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/crawler/background-jobs
 * Start a new autonomous background crawl job on Node.js server
 */
export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Dữ liệu yêu cầu không phải định dạng JSON hợp lệ' },
        { status: 400 }
      );
    }

    const {
      url,
      startChapter,
      endChapter,
      maxChapters,
      autoTranslate,
      translationGenre,
      delayMs,
      cookieConfig,
      preferredNovelTitle,
    } = body as CreateBackgroundJobParams;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        { error: 'Vui lòng cung cấp URL truyện hợp lệ' },
        { status: 400 }
      );
    }

    const job = await backgroundCrawler.startJob({
      url: url.trim(),
      startChapter: typeof startChapter === 'number' ? startChapter : 1,
      endChapter: typeof endChapter === 'number' ? endChapter : undefined,
      maxChapters: typeof maxChapters === 'number' ? maxChapters : undefined,
      autoTranslate: Boolean(autoTranslate),
      translationGenre,
      delayMs: typeof delayMs === 'number' ? delayMs : 1200,
      cookieConfig,
      preferredNovelTitle,
    });

    return NextResponse.json(
      {
        success: true,
        data: job,
        message: `Đã khởi tạo thành công tiến trình cào ngầm cho "${job.novelTitle}". Máy chủ đang tự động cào và ghi vào Supabase.`,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('[Background Job Route Error]:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
