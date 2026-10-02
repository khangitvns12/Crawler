import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { Chapter } from '@/types/novel';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const chapters = serverStorage.getChapters(id);
    return NextResponse.json({ success: true, data: chapters });
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

    const processedChapters: Chapter[] = chapters.map((ch: Partial<Chapter>, index: number) => ({
      id: ch.id || `chap-${id}-${ch.chapterNumber || index + 1}-${Date.now()}`,
      novelId: id,
      chapterNumber: ch.chapterNumber ?? index + 1,
      title: ch.title || `Chương ${ch.chapterNumber ?? index + 1}`,
      translatedTitle: ch.translatedTitle,
      sourceUrl: ch.sourceUrl || '',
      rawContent: ch.rawContent || '',
      translatedContent: ch.translatedContent,
      translationStatus: ch.translationStatus || (ch.translatedContent ? 'translated' : 'pending'),
      translationError: ch.translationError,
      translatedAt: ch.translatedAt || (ch.translatedContent ? new Date().toISOString() : undefined),
      wordCount: ch.wordCount || (ch.translatedContent || ch.rawContent || '').split(/\s+/).filter(Boolean).length,
      createdAt: ch.createdAt || new Date().toISOString(),
    }));

    serverStorage.saveChapters(processedChapters);
    return NextResponse.json({ success: true, count: processedChapters.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
