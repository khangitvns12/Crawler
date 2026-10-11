import { NextRequest, NextResponse } from 'next/server';
import { backgroundCrawler } from '@/lib/background-crawler';

/**
 * POST /api/crawler/background-jobs/[jobId]/action
 * Dispatch action: 'pause' | 'resume' | 'cancel'
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Dữ liệu không phải JSON hợp lệ' },
        { status: 400 }
      );
    }

    const { action } = body as { action?: string };

    if (!action || !['pause', 'resume', 'cancel'].includes(action)) {
      return NextResponse.json(
        { error: 'Hành động không hợp lệ. Cho phép: "pause", "resume", "cancel"' },
        { status: 400 }
      );
    }

    let success = false;
    let message = '';

    if (action === 'pause') {
      success = backgroundCrawler.pauseJob(jobId);
      message = success ? 'Đã tạm dừng tác vụ cào ngầm.' : 'Không thể tạm dừng tác vụ (có thể tác vụ không ở trạng thái đang chạy).';
    } else if (action === 'resume') {
      success = backgroundCrawler.resumeJob(jobId);
      message = success ? 'Đã tiếp tục tác vụ cào ngầm.' : 'Không thể tiếp tục tác vụ (có thể tác vụ không ở trạng thái tạm dừng).';
    } else if (action === 'cancel') {
      success = backgroundCrawler.cancelJob(jobId);
      message = success ? 'Đã hủy tác vụ cào ngầm.' : 'Không thể hủy tác vụ.';
    }

    const updatedJob = backgroundCrawler.getJob(jobId);

    return NextResponse.json({
      success,
      message,
      data: updatedJob,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
