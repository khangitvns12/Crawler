import { NextRequest, NextResponse } from 'next/server';
import { translateChapter, translateNovelMetadata } from '@/lib/gemini';
import { serverStorage } from '@/lib/server-storage';
import { TranslationGenre } from '@/types/novel';

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Dữ liệu yêu cầu không phải định dạng JSON hợp lệ' }, { status: 400 });
    }

    const {
      mode,
      title,
      author,
      description,
      content,
      sourceLang,
      targetLang = 'Tiếng Việt',
      genre,
      glossary,
      novelId,
      chapterNumber,
      modelName,
    } = body as {
      mode?: 'novel' | 'metadata' | 'chapter';
      title?: string;
      author?: string;
      description?: string;
      content?: string;
      sourceLang?: string;
      targetLang?: string;
      genre?: TranslationGenre;
      glossary?: Record<string, string>;
      novelId?: string;
      chapterNumber?: number;
      modelName?: string;
    };

    // Mode 1: Translate Novel Title & Metadata
    if (mode === 'novel' || mode === 'metadata' || (!content && title)) {
      if (!title || typeof title !== 'string' || !title.trim()) {
        return NextResponse.json({ error: 'Tiêu đề truyện không được để trống' }, { status: 400 });
      }

      const metaResult = await translateNovelMetadata({
        title: title.trim(),
        author: author?.trim(),
        description: description?.trim(),
        sourceLang,
        targetLang,
        genre,
        glossary,
        modelName,
      });

      // If novelId is provided, optionally update existing novel in storage
      if (novelId) {
        const existing = serverStorage.getNovel(novelId);
        if (existing) {
          const updatedNovel = {
            ...existing,
            originalTitle: existing.originalTitle || existing.title,
            title: metaResult.translatedTitle,
            description: metaResult.translatedDescription || existing.description,
            author: metaResult.translatedAuthor || existing.author,
            translationGenre: genre || existing.translationGenre,
            updatedAt: new Date().toISOString(),
          };
          serverStorage.saveNovel(updatedNovel);
        }
      }

      return NextResponse.json({
        success: true,
        data: metaResult,
      });
    }

    // Mode 2: Translate Chapter Content
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Nội dung dịch không được để trống' }, { status: 400 });
    }

    const result = await translateChapter({
      title,
      content,
      sourceLang,
      targetLang,
      genre,
      glossary,
      modelName,
    });

    // If novelId & chapterNumber supplied, persist to server storage
    if (novelId && typeof chapterNumber === 'number') {
      serverStorage.updateChapterTranslation(
        novelId,
        chapterNumber,
        result.translatedTitle,
        result.translatedContent
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
