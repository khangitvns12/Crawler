import { NextRequest, NextResponse } from 'next/server';
import { inspectNovel } from '@/lib/crawler-engine';
import { CookieConfig, CrawlerConfig } from '@/types/novel';

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Dữ liệu yêu cầu không phải định dạng JSON hợp lệ' }, { status: 400 });
    }

    const { url, cookieConfig, crawlerConfig, fetchAllPages, maxPages } = body as {
      url: string;
      cookieConfig?: CookieConfig;
      crawlerConfig?: CrawlerConfig;
      fetchAllPages?: boolean;
      maxPages?: number;
    };

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL không hợp lệ' }, { status: 400 });
    }

    const metadata = await inspectNovel(url.trim(), cookieConfig, crawlerConfig, {
      fetchAllPages: fetchAllPages !== false,
      maxPages: maxPages || 150,
    });
    return NextResponse.json({ success: true, data: metadata });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
