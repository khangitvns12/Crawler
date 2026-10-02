import { NextRequest, NextResponse } from 'next/server';
import { translateChapter } from '@/lib/gemini';
import { serverStorage } from '@/lib/server-storage';
import { TranslationGenre } from '@/types/novel';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      content,
      sourceLang,
      targetLang,
      genre,
      glossary,
      novelId,
      chapterNumber,
    } = body as {
      title?: string;
      content: string;
      sourceLang?: string;
      targetLang?: string;
      genre?: TranslationGenre;
      glossary?: Record<string, string>;
      novelId?: string;
      chapterNumber?: number;
    };

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
