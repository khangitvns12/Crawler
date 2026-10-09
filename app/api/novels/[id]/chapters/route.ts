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
    const url = req.nextUrl;
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    const headersOnly = url.searchParams.get('headersOnly') === 'true' || url.searchParams.get('toc') === 'true';
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    let chapters = await serverStorage.getChaptersAsync(id, forceRefresh);
    const totalCount = chapters.length;

    // Filter by chapter range if specified (e.g. from=1&to=1000)
    if (fromParam) {
      const fromNum = parseInt(fromParam, 10);
      if (!isNaN(fromNum)) {
        chapters = chapters.filter(c => c.chapterNumber >= fromNum);
      }
    }
    if (toParam) {
      const toNum = parseInt(toParam, 10);
      if (!isNaN(toNum)) {
        chapters = chapters.filter(c => c.chapterNumber <= toNum);
      }
    }

    // Offset & Limit pagination if specified
    if (offsetParam) {
      const offset = parseInt(offsetParam, 10);
      if (!isNaN(offset) && offset > 0) {
        chapters = chapters.slice(offset);
      }
    }
    if (limitParam) {
      const limit = parseInt(limitParam, 10);
      if (!isNaN(limit) && limit > 0) {
        chapters = chapters.slice(0, limit);
      }
    }

    if (headersOnly) {
      const lightHeaders = chapters.map(ch => ({
        id: ch.id,
        novelId: ch.novelId,
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        translatedTitle: ch.translatedTitle,
        sourceUrl: ch.sourceUrl,
        translationStatus: ch.translationStatus,
        translationError: ch.translationError,
        translatedAt: ch.translatedAt,
        wordCount: ch.wordCount,
        createdAt: ch.createdAt,
      }));
      return NextResponse.json({
        success: true,
        data: lightHeaders,
        total: totalCount,
        count: lightHeaders.length,
      });
    }

    return NextResponse.json({
      success: true,
      data: sanitizeChapters(chapters),
      total: totalCount,
      count: chapters.length,
    });
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

