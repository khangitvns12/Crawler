import { NextRequest, NextResponse } from 'next/server';
import { scrapeChapterContent } from '@/lib/crawler-engine';
import { CookieConfig, CrawlerConfig } from '@/types/novel';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, cookieConfig, crawlerConfig } = body as {
      url: string;
      cookieConfig?: CookieConfig;
      crawlerConfig?: CrawlerConfig;
    };

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL chương không hợp lệ' }, { status: 400 });
    }

    const chapterData = await scrapeChapterContent(url.trim(), cookieConfig, crawlerConfig);
    return NextResponse.json({ success: true, data: chapterData });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
