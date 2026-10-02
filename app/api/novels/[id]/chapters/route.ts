import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { Chapter } from '@/types/novel';
import { cleanChapterTitle, sanitizeChapters } from '@/lib/chapter-utils';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const chapters = serverStorage.getChapters(id);
    return NextResponse.json({ success: true, data: sanitizeChapters(chapters) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const chapters = Array.isArray(body) ? body : [body];

    const processedChapters: Chapter[] = chapters.map((ch: Partial<Chapter>, index: number) => {
      const chapterNumber = ch.chapterNumber ?? index + 1;
      const rawTitle = ch.title || `Chương ${chapterNumber}`;
      const cleanedTitle = cleanChapterTitle(rawTitle, chapterNumber) || `Chương ${chapterNumber}`;
      const cleanedTranslated = ch.translatedTitle
        ? cleanChapterTitle(ch.translatedTitle, chapterNumber)
        : undefined;

      return {
        id: ch.id || `chap-${id}-${chapterNumber}-${Date.now()}`,
        novelId: id,
        chapterNumber,
        title: cleanedTitle,
        translatedTitle: cleanedTranslated,
        sourceUrl: ch.sourceUrl || '',
        rawContent: ch.rawContent || '',
        translatedContent: ch.translatedContent,
        translationStatus: ch.translationStatus || (ch.translatedContent ? 'translated' : 'pending'),
        translationError: ch.translationError,
        translatedAt: ch.translatedAt || (ch.translatedContent ? new Date().toISOString() : undefined),
        wordCount: ch.wordCount || (ch.translatedContent || ch.rawContent || '').split(/\s+/).filter(Boolean).length,
        createdAt: ch.createdAt || new Date().toISOString(),
      };
    });

    await serverStorage.saveChaptersAsync(processedChapters);
    return NextResponse.json({ success: true, count: processedChapters.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
