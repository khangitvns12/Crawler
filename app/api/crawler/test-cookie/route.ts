import { NextRequest, NextResponse } from 'next/server';
import { fetchHtmlWithCookies } from '@/lib/crawler-engine';
import { CookieConfig } from '@/types/novel';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, cookieConfig } = body as {
      url: string;
      cookieConfig?: CookieConfig;
    };

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL kiểm tra không hợp lệ' }, { status: 400 });
    }

    const startTime = Date.now();
    const { html, status, headers } = await fetchHtmlWithCookies({
      url: url.trim(),
      cookieConfig,
      timeoutMs: 15000,
    });
    const durationMs = Date.now() - startTime;

    // Check for cookie indicators / login signs
    const isCloudflareBlocked = html.includes('cf-browser-verification') || html.includes('Just a moment...') || status === 403;
    const hasVipSigns = /vip|premium|member|đăng nhập|login|tài khoản/i.test(html);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : 'Không tìm thấy tiêu đề';

    return NextResponse.json({
      success: true,
      status,
      durationMs,
      pageSizeBytes: html.length,
      pageTitle,
      isCloudflareBlocked,
      hasVipSigns,
      responseHeadersSnippet: {
        server: headers['server'] || 'N/A',
        contentType: headers['content-type'] || 'N/A',
        setCookie: headers['set-cookie'] ? 'Có nhận Set-Cookie mới' : 'Không',
      },
      previewText: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) + '...',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
