import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { Novel } from '@/types/novel';

export async function GET() {
  try {
    const novels = serverStorage.getAllNovels();
    return NextResponse.json({ success: true, data: novels });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Dữ liệu yêu cầu không phải định dạng JSON hợp lệ' }, { status: 400 });
    }
    const novelData = body as Partial<Novel>;

    if (!novelData.title || typeof novelData.title !== 'string') {
      return NextResponse.json({ error: 'Tên truyện không được để trống' }, { status: 400 });
    }

    const id = novelData.id || `novel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const novel: Novel = {
      id,
      title: novelData.title.trim(),
      originalTitle: novelData.originalTitle?.trim() || '',
      author: novelData.author?.trim() || 'Khuyết danh',
      description: novelData.description?.trim() || '',
      coverUrl: novelData.coverUrl?.trim() || '',
      sourceUrl: novelData.sourceUrl?.trim() || '',
      sourceDomain: novelData.sourceDomain || (novelData.sourceUrl ? new URL(novelData.sourceUrl).hostname : 'custom'),
      originalLanguage: novelData.originalLanguage || 'auto',
      targetLanguage: novelData.targetLanguage || 'vi',
      status: novelData.status || 'ongoing',
      chaptersCount: novelData.chaptersCount || 0,
      translatedChaptersCount: novelData.translatedChaptersCount || 0,
      lastReadChapterNumber: novelData.lastReadChapterNumber || 1,
      cookieConfig: novelData.cookieConfig,
      crawlerConfig: novelData.crawlerConfig,
      glossary: novelData.glossary || {},
      translationGenre: novelData.translationGenre || 'general',
      createdAt: novelData.createdAt || now,
      updatedAt: now,
    };

    const saved = await serverStorage.saveNovelAsync(novel);
    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
