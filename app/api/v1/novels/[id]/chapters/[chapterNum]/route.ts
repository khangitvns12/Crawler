import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; chapterNum: string }> }
) {
  try {
    const { id, chapterNum } = await params;
    const { origin, searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'translated'; // 'translated' | 'original' | 'both'

    const novel = serverStorage.getNovelById(id);
    if (!novel) {
      return NextResponse.json({ status: 'error', message: 'Novel not found' }, { status: 404 });
    }

    const num = parseInt(chapterNum, 10);
    if (isNaN(num)) {
      return NextResponse.json({ status: 'error', message: 'Invalid chapter number' }, { status: 400 });
    }

    const chapter = await serverStorage.getChapterAsync(id, num);
    if (!chapter) {
      return NextResponse.json({ status: 'error', message: `Chapter ${num} not found` }, { status: 404 });
    }

    // Determine content based on format
    let content = '';
    if (format === 'original') {
      content = chapter.rawContent || '';
    } else if (format === 'both') {
      content = `[BẢN DỊCH]:\n${chapter.translatedContent || 'Chưa dịch'}\n\n====================\n\n[BẢN GỐC]:\n${chapter.rawContent}`;
    } else {
      content = chapter.translatedContent || chapter.rawContent || '';
    }

    const allChapters = serverStorage.getChapters(id);
    const hasNext = allChapters.some(c => c.chapterNumber === num + 1);
    const hasPrev = allChapters.some(c => c.chapterNumber === num - 1);

    return NextResponse.json({
      status: 'success',
      data: {
        novelId: id,
        novelTitle: novel.title,
        chapterNumber: num,
        title: chapter.translatedTitle || chapter.title,
        originalTitle: chapter.title,
        format,
        content,
        wordCount: chapter.wordCount,
        translationStatus: chapter.translationStatus,
        pagination: {
          prevChapter: hasPrev ? num - 1 : null,
          prevUrl: hasPrev ? `${origin}/api/v1/novels/${id}/chapters/${num - 1}?format=${format}` : null,
          nextChapter: hasNext ? num + 1 : null,
          nextUrl: hasNext ? `${origin}/api/v1/novels/${id}/chapters/${num + 1}?format=${format}` : null,
        },
      },
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
