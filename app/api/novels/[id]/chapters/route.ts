import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { Chapter, Novel } from '@/types/novel';
import { cleanChapterTitle, cleanChapterContent, sanitizeChapters, sortChapters } from '@/lib/chapter-utils';
import { isSupabaseConfigured } from '@/lib/supabase';

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
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Dữ liệu yêu cầu không phải định dạng JSON hợp lệ' }, { status: 400 });
    }

    let rawChapters: Array<Partial<Chapter>> = [];
    let novelFallback: Novel | undefined;

    if (Array.isArray(body)) {
      rawChapters = body;
    } else if (body && typeof body === 'object') {
      if (body.chapter) {
        rawChapters = [body.chapter];
      } else if (Array.isArray(body.chapters)) {
        rawChapters = body.chapters;
      } else {
        rawChapters = [body];
      }

      if (body.novel && typeof body.novel === 'object') {
        novelFallback = body.novel as Novel;
      }
    }

    const processedChapters: Chapter[] = rawChapters.map((ch: Partial<Chapter>, index: number) => {
      const chapterNumber = ch.chapterNumber ?? index + 1;
      const rawTitle = ch.title || `Chương ${chapterNumber}`;
      const cleanedTitle = cleanChapterTitle(rawTitle, chapterNumber) || `Chương ${chapterNumber}`;
      const cleanedTranslated = ch.translatedTitle
        ? cleanChapterTitle(ch.translatedTitle, chapterNumber)
        : undefined;

      const rawCleaned = cleanChapterContent(ch.rawContent || '');
      const transCleaned = ch.translatedContent ? cleanChapterContent(ch.translatedContent) : undefined;

      return {
        id: ch.id || `chap-${id}-${chapterNumber}`,
        novelId: id,
        chapterNumber,
        title: cleanedTitle,
        translatedTitle: cleanedTranslated,
        sourceUrl: ch.sourceUrl || '',
        rawContent: rawCleaned,
        translatedContent: transCleaned,
        translationStatus: ch.translationStatus || (transCleaned ? 'translated' : 'pending'),
        translationError: ch.translationError,
        translatedAt: ch.translatedAt || (transCleaned ? new Date().toISOString() : undefined),
        wordCount: ch.wordCount || (transCleaned || rawCleaned).split(/\s+/).filter(Boolean).length,
        createdAt: ch.createdAt || new Date().toISOString(),
      };
    });

    // Automatically sort chapters strictly in order
    processedChapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

    await serverStorage.saveChaptersAsync(processedChapters, novelFallback);
    return NextResponse.json({
      success: true,
      count: processedChapters.length,
      novelId: id,
      supabaseConfigured: isSupabaseConfigured(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

