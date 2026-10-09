import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { sanitizeChapter } from '@/lib/chapter-utils';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; chapterNum: string }> }
) {
  try {
    const { id, chapterNum } = await params;
    const num = parseInt(chapterNum, 10);
    if (isNaN(num)) {
      return NextResponse.json({ error: 'Số chương không hợp lệ' }, { status: 400 });
    }

    const chapter = await serverStorage.getChapterAsync(id, num);
    if (!chapter) {
      return NextResponse.json({ error: `Không tìm thấy chương ${num}` }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: sanitizeChapter(chapter),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
