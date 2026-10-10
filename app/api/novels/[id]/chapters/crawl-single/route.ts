import { NextRequest, NextResponse } from 'next/server';
import { scrapeChapterContent } from '@/lib/crawler-engine';
import { serverStorage } from '@/lib/server-storage';
import { translateChapter } from '@/lib/gemini';
import { cleanChapterTitle, cleanChapterContent, parseChapterNumber, sanitizeChapter } from '@/lib/chapter-utils';
import { fetchActiveSupabaseApiKeyStrings, isSupabaseConfigured } from '@/lib/supabase';
import { Chapter, CookieConfig, CrawlerConfig, TranslationGenre } from '@/types/novel';

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
      return NextResponse.json({ error: 'Dữ liệu yêu cầu không phải JSON hợp lệ' }, { status: 400 });
    }

    const {
      chapterUrl,
      chapterNumber,
      autoTranslate = false,
      genre,
      modelName,
      cookieConfig,
      crawlerConfig,
    } = body as {
      chapterUrl: string;
      chapterNumber?: number;
      autoTranslate?: boolean;
      genre?: TranslationGenre;
      modelName?: string;
      cookieConfig?: CookieConfig;
      crawlerConfig?: CrawlerConfig;
    };

    if (!chapterUrl || typeof chapterUrl !== 'string' || !chapterUrl.trim().startsWith('http')) {
      return NextResponse.json({ error: 'Vui lòng cung cấp URL hợp lệ của chương truyện (bắt đầu bằng http:// hoặc https://)' }, { status: 400 });
    }

    // 1. Scrape chapter text
    const scrapeResult = await scrapeChapterContent(chapterUrl.trim(), cookieConfig, crawlerConfig);
    if (!scrapeResult.content && !scrapeResult.title) {
      return NextResponse.json({ error: 'Không thể trích xuất nội dung từ liên kết này. Vui lòng kiểm tra lại URL hoặc cấu hình Cookie VIP.' }, { status: 422 });
    }

    // 2. Determine target chapter number
    const existingChapters = await serverStorage.getChaptersAsync(id);
    let finalChapNum = chapterNumber;

    if (typeof finalChapNum !== 'number' || isNaN(finalChapNum) || finalChapNum <= 0) {
      const parsedFromTitle = parseChapterNumber(scrapeResult.title);
      if (parsedFromTitle !== null && parsedFromTitle > 0) {
        finalChapNum = parsedFromTitle;
      } else {
        const maxNum = existingChapters.reduce((max, c) => Math.max(max, c.chapterNumber), 0);
        finalChapNum = maxNum + 1;
      }
    }

    const cleanedTitle = cleanChapterTitle(scrapeResult.title, finalChapNum) || `Chương ${finalChapNum}`;
    const cleanedRawContent = cleanChapterContent(scrapeResult.content);

    let translatedTitle: string | undefined = undefined;
    let translatedContent: string | undefined = undefined;
    let translationStatus: Chapter['translationStatus'] = 'pending';
    let translatedAt: string | undefined = undefined;

    // 3. Auto-translate with AI if requested
    if (autoTranslate) {
      try {
        let activeKeys: string[] = [];
        if (isSupabaseConfigured()) {
          try {
            activeKeys = await fetchActiveSupabaseApiKeyStrings();
          } catch {
            // fallback
          }
        }

        const novel = serverStorage.getNovel(id);
        const transGenre = genre || novel?.translationGenre || 'general';

        const transRes = await translateChapter({
          title: cleanedTitle,
          content: cleanedRawContent,
          targetLang: 'Tiếng Việt',
          genre: transGenre,
          modelName,
          apiKeys: activeKeys,
        });

        if (transRes?.translatedContent) {
          translatedTitle = cleanChapterTitle(transRes.translatedTitle, finalChapNum);
          translatedContent = cleanChapterContent(transRes.translatedContent);
          translationStatus = 'translated';
          translatedAt = new Date().toISOString();
        }
      } catch (transErr: unknown) {
        console.warn('Auto-translate error in crawl-single:', transErr);
        // Chapter remains saved with raw content even if translation failed
      }
    }

    // 4. Build chapter entity
    const newChapter: Chapter = {
      id: `chap-${id}-${finalChapNum}`,
      novelId: id,
      chapterNumber: finalChapNum,
      title: cleanedTitle,
      translatedTitle,
      sourceUrl: chapterUrl.trim(),
      rawContent: cleanedRawContent,
      translatedContent,
      translationStatus,
      translatedAt,
      wordCount: (translatedContent || cleanedRawContent).split(/\s+/).filter(Boolean).length,
      createdAt: new Date().toISOString(),
    };

    // 5. Persist to Supabase and server storage
    const saved = await serverStorage.saveChapterAsync(newChapter);

    return NextResponse.json({
      success: true,
      message: `Đã cào thành công Chương ${finalChapNum}: "${cleanedTitle}" và lưu vào Supabase!`,
      data: sanitizeChapter(saved),
      supabaseConfigured: isSupabaseConfigured(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
