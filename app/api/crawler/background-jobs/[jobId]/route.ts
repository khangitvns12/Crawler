import { NextRequest, NextResponse } from 'next/server';
import { backgroundCrawler } from '@/lib/background-crawler';

/**
 * GET /api/crawler/background-jobs/[jobId]
 * Get status and recent logs of a specific background job
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = backgroundCrawler.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: `Không tìm thấy tác vụ cào ngầm với mã ${jobId}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/crawler/background-jobs/[jobId]
 * Delete a background job
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const deleted = backgroundCrawler.deleteJob(jobId);

    if (!deleted) {
      return NextResponse.json(
        { error: `Không tìm thấy tác vụ cào ngầm với mã ${jobId}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa tác vụ cào ngầm khỏi danh sách.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
