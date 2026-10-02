import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { origin } = new URL(req.url);
    const novel = serverStorage.getNovelById(id);

    if (!novel) {
      return NextResponse.json({
        status: 'error',
        message: `Novel with ID '${id}' not found`,
      }, { status: 404 });
    }

    const chapters = serverStorage.getChapters(id);
    const formattedChapters = chapters.map(ch => ({
      chapterNumber: ch.chapterNumber,
      title: ch.translatedTitle || ch.title,
      originalTitle: ch.title,
      wordCount: ch.wordCount,
      translationStatus: ch.translationStatus,
      translatedAt: ch.translatedAt || null,
      links: {
        read: `${origin}/api/v1/novels/${id}/chapters/${ch.chapterNumber}`,
      },
    }));

    return NextResponse.json({
      status: 'success',
      apiVersion: '1.0',
      data: {
        id: novel.id,
        title: novel.title,
        originalTitle: novel.originalTitle || null,
        author: novel.author,
        description: novel.description,
        coverUrl: novel.coverUrl || null,
        sourceUrl: novel.sourceUrl || null,
        chaptersCount: novel.chaptersCount,
        translatedChaptersCount: novel.translatedChaptersCount,
        status: novel.status,
        chapters: formattedChapters,
        links: {
          epub: `${origin}/api/v1/novels/${id}/epub`,
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
