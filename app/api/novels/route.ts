import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { Novel } from '@/types/novel';

export async function GET() {
  try {
    const novels = await serverStorage.getAllNovelsAsync();
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

    // Check for existing matching novel first (Deduplication)
    const existingMatch = serverStorage.findExistingNovel({
      id: novelData.id,
      sourceUrl: novelData.sourceUrl,
      title: novelData.title,
      originalTitle: novelData.originalTitle,
    });

    const id = existingMatch ? existingMatch.id : (novelData.id || `novel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    const now = new Date().toISOString();

    const novel: Novel = {
      ...(existingMatch || {}),
      id,
      title: novelData.title.trim(),
      originalTitle: novelData.originalTitle?.trim() || existingMatch?.originalTitle || '',
      author: novelData.author?.trim() || existingMatch?.author || 'Khuyết danh',
      description: novelData.description?.trim() || existingMatch?.description || '',
      coverUrl: novelData.coverUrl?.trim() || existingMatch?.coverUrl || '',
      sourceUrl: novelData.sourceUrl?.trim() || existingMatch?.sourceUrl || '',
      sourceDomain: novelData.sourceDomain || existingMatch?.sourceDomain || (novelData.sourceUrl ? new URL(novelData.sourceUrl).hostname : 'custom'),
      originalLanguage: novelData.originalLanguage || existingMatch?.originalLanguage || 'auto',
      targetLanguage: novelData.targetLanguage || existingMatch?.targetLanguage || 'vi',
      status: novelData.status || existingMatch?.status || 'ongoing',
      chaptersCount: Math.max(novelData.chaptersCount || 0, existingMatch?.chaptersCount || 0),
      translatedChaptersCount: Math.max(novelData.translatedChaptersCount || 0, existingMatch?.translatedChaptersCount || 0),
      lastReadChapterNumber: novelData.lastReadChapterNumber || existingMatch?.lastReadChapterNumber || 1,
      cookieConfig: novelData.cookieConfig || existingMatch?.cookieConfig,
      crawlerConfig: novelData.crawlerConfig || existingMatch?.crawlerConfig,
      glossary: { ...(existingMatch?.glossary || {}), ...(novelData.glossary || {}) },
      translationGenre: novelData.translationGenre || existingMatch?.translationGenre || 'general',
      createdAt: existingMatch?.createdAt || novelData.createdAt || now,
      updatedAt: now,
    };

    const saved = await serverStorage.saveNovelAsync(novel);
    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
