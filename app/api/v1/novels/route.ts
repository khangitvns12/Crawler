import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';

export async function GET(req: NextRequest) {
  try {
    const { origin } = new URL(req.url);
    const novels = serverStorage.getAllNovels();

    const formattedNovels = novels.map(n => ({
      id: n.id,
      title: n.title,
      originalTitle: n.originalTitle || null,
      author: n.author,
      description: n.description,
      coverUrl: n.coverUrl || null,
      sourceUrl: n.sourceUrl || null,
      sourceDomain: n.sourceDomain,
      status: n.status,
      chaptersCount: n.chaptersCount,
      translatedChaptersCount: n.translatedChaptersCount,
      lastReadChapterNumber: n.lastReadChapterNumber || 1,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      links: {
        self: `${origin}/api/v1/novels/${n.id}`,
        epub: `${origin}/api/v1/novels/${n.id}/epub`,
      },
    }));

    return NextResponse.json({
      status: 'success',
      apiVersion: '1.0',
      total: formattedNovels.length,
      data: formattedNovels,
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
