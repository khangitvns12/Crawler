import * as cheerio from 'cheerio';
import { CookieConfig, CrawlerConfig } from '@/types/novel';
import { findPresetForUrl } from './preset-extractors';
import { cleanChapterTitle, cleanChapterContent, parseChapterNumber } from './chapter-utils';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface CrawlFetchOptions {
  url: string;
  cookieConfig?: CookieConfig;
  customHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export interface NovelMetadata {
  title: string;
  author: string;
  description: string;
  coverUrl: string;
  totalPages?: number;
  chapters: Array<{
    number: number;
    title: string;
    url: string;
  }>;
}

export interface InspectOptions {
  cookieConfig?: CookieConfig;
  customConfig?: CrawlerConfig;
  fetchAllPages?: boolean;
  maxPages?: number;
}

export interface ChapterContentResult {
  title: string;
  content: string;
  wordCount: number;
  rawHtml?: string;
}

/**
 * Fetch HTML with full Cookie, custom headers, and intelligent multi-encoding support (GBK/GB18030, Shift_JIS, Big5, UTF-8)
 */
export async function fetchHtmlWithCookies(options: CrawlFetchOptions): Promise<{ html: string; status: number; headers: Record<string, string> }> {
  const { url, cookieConfig, customHeaders, timeoutMs = 20000 } = options;
  
  const headers: Record<string, string> = {
    'User-Agent': cookieConfig?.userAgent || DEFAULT_USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6,ja;q=0.5',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...(customHeaders || {}),
  };

  if (cookieConfig?.cookieString?.trim()) {
    headers['Cookie'] = cookieConfig.cookieString.trim();
  }

  if (cookieConfig?.referer) {
    headers['Referer'] = cookieConfig.referer;
  } else {
    try {
      const parsedUrl = new URL(url);
      headers['Referer'] = parsedUrl.origin;
    } catch {
      // ignore
    }
  }

  if (cookieConfig?.customHeaders) {
    Object.assign(headers, cookieConfig.customHeaders);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    const status = response.status;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const contentType = response.headers.get('content-type') || '';
    const contentTypeLower = contentType.toLowerCase();
    const arrayBuffer = await response.arrayBuffer();

    // Known GBK Chinese novel sites (69shuba, biquge, 5200, ptwxz, etc.)
    const isKnownGbkSite = /69shuba|69shu|69xinshu|69yuedu|biquge|xbiquge|5200|ptwxz|piaotian|bxwx|uukanshu|77xsw|dingdian/i.test(url);
    const isKnownJapaneseSite = /syosetu|kakuyomu|alphapolis|hameln/i.test(url);

    // Inspect first 4096 bytes for <meta charset="..."> or <meta http-equiv="Content-Type" content="...charset=...">
    let detectedEncoding = 'utf-8';
    try {
      const asciiSample = new TextDecoder('ascii', { fatal: false }).decode(arrayBuffer.slice(0, 4096));
      const metaMatch = asciiSample.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i) ||
                        asciiSample.match(/<meta[^>]+content=["'][^"']*charset=([a-zA-Z0-9_-]+)/i);
      if (metaMatch) {
        const cs = metaMatch[1].toLowerCase();
        if (cs === 'gbk' || cs === 'gb2312' || cs === 'gb18030') {
          detectedEncoding = 'gb18030';
        } else if (cs === 'shift_jis' || cs === 'sjis' || cs === 'shift-jis') {
          detectedEncoding = 'shift_jis';
        } else if (cs === 'euc-jp') {
          detectedEncoding = 'euc-jp';
        } else if (cs === 'big5') {
          detectedEncoding = 'big5';
        } else if (cs === 'utf-8') {
          detectedEncoding = 'utf-8';
        }
      }
    } catch {
      // ignore
    }

    // Determine target encoding priority:
    // 1. Explicit charset in Content-Type header
    // 2. Meta tag in HTML
    // 3. Known domain heuristic
    let targetEncoding = 'utf-8';
    if (contentTypeLower.includes('gbk') || contentTypeLower.includes('gb2312') || contentTypeLower.includes('gb18030')) {
      targetEncoding = 'gb18030';
    } else if (contentTypeLower.includes('shift_jis') || contentTypeLower.includes('shift-jis') || contentTypeLower.includes('sjis')) {
      targetEncoding = 'shift_jis';
    } else if (contentTypeLower.includes('euc-jp')) {
      targetEncoding = 'euc-jp';
    } else if (contentTypeLower.includes('big5')) {
      targetEncoding = 'big5';
    } else if (detectedEncoding !== 'utf-8') {
      targetEncoding = detectedEncoding;
    } else if (isKnownGbkSite) {
      targetEncoding = 'gb18030';
    } else if (isKnownJapaneseSite) {
      targetEncoding = 'utf-8';
    }

    let html = '';
    try {
      const decoder = new TextDecoder(targetEncoding);
      html = decoder.decode(arrayBuffer);
    } catch {
      const fallbackDecoder = new TextDecoder('utf-8');
      html = fallbackDecoder.decode(arrayBuffer);
    }

    // If decoded with UTF-8 but domain was a Chinese raw site and produced mojibake (\uFFFD), retry with gb18030
    if (targetEncoding === 'utf-8' && (isKnownGbkSite || /[\u4e00-\u9fa5]/.test(url))) {
      const replacementCount = (html.match(/\uFFFD/g) || []).length;
      if (replacementCount > 10) {
        try {
          const gbkDecoder = new TextDecoder('gb18030');
          const gbkHtml = gbkDecoder.decode(arrayBuffer);
          const gbkReplacements = (gbkHtml.match(/\uFFFD/g) || []).length;
          if (gbkReplacements < replacementCount) {
            html = gbkHtml;
          }
        } catch {
          // ignore
        }
      }
    }

    return { html, status, headers: responseHeaders };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Lỗi kết nối tới ${url}: ${errorMsg}`);
  }
}

/**
 * Clean HTML element text into neat paragraphs and remove website source attributions/watermarks
 */
function cleanContentHtml(html: string): string {
  let text = html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '\n')
    .replace(/&emsp;/gi, ' ')
    .replace(/&ensp;/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[\u3000\u2003]/g, ' ')
    .replace(/loadAdv\s*\(\s*\d+\s*,\s*\d+\s*\)\s*;?/gi, '');

  text = text.replace(/<[^>]+>/g, '');

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !/^loadAdv\s*\(/i.test(line));

  const rawParagraphs = lines.join('\n\n');
  return cleanChapterContent(rawParagraphs);
}

/**
 * Helper to extract chapter links from a cheerio document
 */
function extractChaptersFromCheerio(
  $: cheerio.CheerioAPI,
  config: CrawlerConfig,
  currentUrl: string,
  chapters: Array<{ number: number; title: string; url: string }>
) {
  const parsedOrigin = new URL(currentUrl);

  // Collect potential chapter link elements
  const selectors = [
    config.chapterListSelector,
    '#catalog a',
    '.catalog a',
    '#catalog ul li a',
    '.catalog ul li a',
    'a[href*="/txt/"]',
    '.list-chapter a',
    '#list-chapter a',
    '.chapter-list a',
    '#chapter-list a',
    'ul.list-chapter li a',
    '#list-chapter li a',
    '.list-chapters a',
    '#chapters-list a',
    '#list dd a',
    '#list a',
    '.listmain a',
    'div.list-chapter a',
    'div.row-chapter a',
    'a[href*="/chuong-"]',
    'a[href*="/chap-"]',
    'a[href*="/chapter-"]',
    'a[href*="/chuong/"]',
  ].filter(Boolean) as string[];

  const foundElements = $(selectors.join(', '));

  foundElements.each((_, el) => {
    const linkTag = $(el);
    const href = linkTag.attr('href');

    if (!href || href.startsWith('javascript:') || href === '#') return;

    let fullUrl = href;
    try {
      fullUrl = new URL(href, currentUrl).href;
    } catch {
      return;
    }

    // Strip hash (#list-chapter or any fragment anchor)
    const cleanUrl = fullUrl.split('#')[0];

    // Skip home or self links
    if (
      cleanUrl === currentUrl.split('#')[0] || 
      cleanUrl === parsedOrigin.origin || 
      cleanUrl === parsedOrigin.origin + '/'
    ) return;

    // Filter out non-chapter links (navigation, author, categories, book detail pages)
    if (cleanUrl.match(/\/(the-loai|tac-gia|danh-sach|page|author|category|tag|modules\/article)\//i)) return;
    if (cleanUrl.match(/\/trang-\d+\/?$/i)) return; // pagination page itself
    if (cleanUrl.match(/\/book\/\d+(\.htm|\/)?$/i)) return; // novel index/catalog page itself
    if (/69shuba|69shu|69xinshu|69yuedu/i.test(cleanUrl) && !cleanUrl.includes('/txt/')) return; // 69shuba chapters always have /txt/{bookId}/{chapId}

    // Extract chapter title
    let chapTitle = linkTag.text().trim();
    const attrTitle = linkTag.attr('title')?.trim();
    if (attrTitle && (chapTitle.length < 3 || /^\d+$/.test(chapTitle))) {
      chapTitle = attrTitle;
    }

    // Skip utility buttons like "完整目录", "开始阅读", "书架", etc.
    if (/^(?:完整目录|开始阅读|我的书架|加入书架|返回书页|章节目录|投票推荐|目录)$/i.test(chapTitle)) {
      return;
    }

    // Parse real numeric chapter number if present
    const parsedNum = parseChapterNumber(chapTitle);
    const assignedNum = parsedNum !== null ? parsedNum : chapters.length + 1;

    // Remove noisy icons, badges or leading symbols and clean duplicate chapter prefixes
    chapTitle = cleanChapterTitle(chapTitle, assignedNum);
    if (!chapTitle) return;

    // Deduplicate by clean canonical URL
    if (!chapters.some(c => c.url.split('#')[0] === cleanUrl)) {
      chapters.push({
        number: assignedNum,
        title: chapTitle,
        url: cleanUrl,
      });
    }
  });
}

/**
 * Detect pagination pages on multi-page novel sites (e.g. TruyenFull, Metruyenchu, Syosetu, etc.)
 */
function detectPaginationPages(
  $: cheerio.CheerioAPI,
  config: CrawlerConfig,
  initialUrl: string,
  maxPages: number = 150
): { pageUrls: string[]; totalPages: number } {
  const pageUrls: string[] = [];
  let detectedTotalPages = 1;

  // 1. Check TruyenFull's hidden inputs or attributes:
  // e.g. <input type="hidden" id="total-page" value="66"> or data-total-page="66"
  const totalPageInputs = $(
    'input#total-page, input[name="total-page"], input#total_page, [data-total-page], [data-pages], input#truyen-total-page'
  );
  totalPageInputs.each((_, el) => {
    const val = parseInt($(el).val() as string || $(el).attr('data-total-page') || $(el).attr('data-pages') || '1', 10);
    if (!isNaN(val) && val > detectedTotalPages) {
      detectedTotalPages = val;
    }
  });

  // 2. Check <select> dropdown for chapters/pages (TruyenFull select.select-chapter)
  $('select.select-chapter option, select[name*="page"] option, select.form-control option').each((_, el) => {
    const optVal = $(el).attr('value') || '';
    const optText = $(el).text() || '';
    const m = optVal.match(/\/trang-(\d+)/i) || optText.match(/trang\s*(\d+)/i) || optVal.match(/[?&]page=(\d+)/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > detectedTotalPages) detectedTotalPages = num;
    }
  });

  // 3. Scan all pagination containers
  const paginationElements = $(
    config.paginationSelector ||
    '.pagination, ul.pagination, #pagination, div.pagination, .page-nav, ul.page, .pager, div.pages, nav[aria-label*="page"]'
  );

  const foundLinks: Array<{ href: string; text: string }> = [];
  paginationElements.find('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || href.startsWith('javascript:') || href === '#') return;
    try {
      const full = new URL(href, initialUrl).href;
      if (!foundLinks.some(l => l.href === full)) {
        foundLinks.push({ href: full, text });
      }
    } catch {
      // ignore
    }
  });

  // Check if any link contains page numbers like /trang-15/ or ?page=15 or ?p=15
  let pagePattern: 'trang-slug' | 'query-page' | 'query-p' | 'page-slug' | 'discrete' = 'discrete';
  let patternTemplate = '';

  for (const { href, text } of foundLinks) {
    // Check "Cuối", "Last", "末页" links for the absolute last page number
    const isLastLink = /cuối|last|trang cuối|>>|末页|尾页/i.test(text);

    const matchTrang = href.match(/(.*\/trang-)(\d+)(\/?.*)$/i);
    if (matchTrang) {
      const num = parseInt(matchTrang[2], 10);
      if (num > detectedTotalPages) detectedTotalPages = num;
      pagePattern = 'trang-slug';
      patternTemplate = `${matchTrang[1]}{PAGE}${matchTrang[3] || '/'}`;
      continue;
    }

    const matchPageSlug = href.match(/(.*\/page\/)(\d+)(\/?.*)$/i);
    if (matchPageSlug) {
      const num = parseInt(matchPageSlug[2], 10);
      if (num > detectedTotalPages) detectedTotalPages = num;
      pagePattern = 'page-slug';
      patternTemplate = `${matchPageSlug[1]}{PAGE}${matchPageSlug[3] || '/'}`;
      continue;
    }

    const matchQueryPage = href.match(/[?&]page=(\d+)/i);
    if (matchQueryPage) {
      const num = parseInt(matchQueryPage[1], 10);
      if (num > detectedTotalPages) detectedTotalPages = num;
      pagePattern = 'query-page';
      continue;
    }

    const matchQueryP = href.match(/[?&]p=(\d+)/i);
    if (matchQueryP) {
      const num = parseInt(matchQueryP[1], 10);
      if (num > detectedTotalPages) detectedTotalPages = num;
      pagePattern = 'query-p';
      continue;
    }

    if (isLastLink) {
      const numMatch = href.match(/(\d+)/g);
      if (numMatch) {
        const lastNum = parseInt(numMatch[numMatch.length - 1], 10);
        if (lastNum > detectedTotalPages && lastNum < 2000) {
          detectedTotalPages = lastNum;
        }
      }
    }
  }

  // Also check if initial URL itself has truyenfull domain
  if (initialUrl.includes('truyenfull') && pagePattern === 'discrete') {
    pagePattern = 'trang-slug';
  }

  const limitPages = Math.min(detectedTotalPages, maxPages);

  // Clean the initial URL base (remove existing /trang-N/ or query params)
  const cleanBase = initialUrl
    .split('#')[0]
    .replace(/\/trang-\d+\/?$/i, '')
    .replace(/\/page\/\d+\/?$/i, '')
    .replace(/[?&](page|p)=\d+/i, '')
    .replace(/\/+$/, '');

  if (pagePattern === 'trang-slug' && limitPages > 1) {
    for (let p = 2; p <= limitPages; p++) {
      if (patternTemplate && patternTemplate.includes('{PAGE}')) {
        pageUrls.push(patternTemplate.replace('{PAGE}', p.toString()));
      } else {
        pageUrls.push(`${cleanBase}/trang-${p}/`);
      }
    }
  } else if (pagePattern === 'page-slug' && limitPages > 1) {
    for (let p = 2; p <= limitPages; p++) {
      pageUrls.push(`${cleanBase}/page/${p}/`);
    }
  } else if (pagePattern === 'query-page' && limitPages > 1) {
    for (let p = 2; p <= limitPages; p++) {
      const u = new URL(initialUrl);
      u.searchParams.set('page', p.toString());
      pageUrls.push(u.href);
    }
  } else if (pagePattern === 'query-p' && limitPages > 1) {
    for (let p = 2; p <= limitPages; p++) {
      const u = new URL(initialUrl);
      u.searchParams.set('p', p.toString());
      pageUrls.push(u.href);
    }
  } else {
    foundLinks.forEach(link => {
      if (link.href !== initialUrl && !pageUrls.includes(link.href) && pageUrls.length < limitPages) {
        pageUrls.push(link.href);
      }
    });
  }

  // Fallback for TruyenFull style if total-page was found but no links were parsed
  if (pageUrls.length === 0 && detectedTotalPages > 1) {
    for (let p = 2; p <= limitPages; p++) {
      pageUrls.push(`${cleanBase}/trang-${p}/`);
    }
  }

  return { pageUrls, totalPages: Math.max(detectedTotalPages, pageUrls.length + 1) };
}

/**
 * Inspect a novel main/table of contents URL and extract metadata (with Multi-page Pagination & 69shuba Catalog support)
 */
export async function inspectNovel(
  url: string,
  cookieConfig?: CookieConfig,
  customConfig?: CrawlerConfig,
  options?: { fetchAllPages?: boolean; maxPages?: number }
): Promise<NovelMetadata> {
  const is69shuba = /69shuba|69shu|69xinshu|69yuedu/i.test(url);
  const preset = findPresetForUrl(url);
  const config = { ...preset.config, ...(customConfig || {}) };

  let mainUrl = url;
  let catalogUrl = url;
  let detailUrl = url;

  // 69shuba URL normalization: book page (/book/{id}.htm) has metadata, catalog (/book/{id}/) has ALL chapters
  if (is69shuba) {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;
      const bookIdMatch = url.match(/(?:book|txt)\/(\d+)/i);
      if (bookIdMatch) {
        const bookId = bookIdMatch[1];
        detailUrl = `https://${hostname}/book/${bookId}.htm`;
        catalogUrl = `https://${hostname}/book/${bookId}/`;
        mainUrl = detailUrl;
      }
    } catch {
      // ignore
    }
  }

  const { html } = await fetchHtmlWithCookies({ url: mainUrl, cookieConfig });
  const $ = cheerio.load(html);

  // 1. Extract Title
  let title = '';
  if (config.titleSelector) {
    title = $(config.titleSelector).first().text().trim();
  }
  if (!title) {
    title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    title = title.replace(/\s*[-|_|–]\s*(TruyenFull|Metruyenchu|Tangthuvien|NovelFull|Syosetu|Biquge|69shuba|69shu|Đọc truyện).*$/i, '').trim();
  }

  // 2. Extract Author
  let author = 'Chưa rõ tác giả';
  if (config.authorSelector) {
    const rawAuthor = $(config.authorSelector).first().text().trim();
    if (rawAuthor) {
      author = rawAuthor.replace(/^(Tác giả|Author|作者|Writer)[:：\s]*/i, '').trim();
    }
  }
  if (!author || author === 'Chưa rõ tác giả') {
    const metaAuthor = $('meta[name="author"]').attr('content') || $('meta[property="book:author"]').attr('content');
    if (metaAuthor) author = metaAuthor.trim();
  }

  // 3. Extract Description
  let description = '';
  if (config.descriptionSelector) {
    description = cleanContentHtml($(config.descriptionSelector).first().html() || '');
  }
  if (!description) {
    description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
  }

  // 4. Extract Cover URL
  let coverUrl = '';
  if (config.coverSelector) {
    coverUrl = $(config.coverSelector).first().attr('src') || $(config.coverSelector).first().attr('data-src') || '';
  }
  if (!coverUrl) {
    coverUrl = $('meta[property="og:image"]').attr('content') || '';
  }
  if (coverUrl && !coverUrl.startsWith('http')) {
    try {
      coverUrl = new URL(coverUrl, url).href;
    } catch {
      // ignore
    }
  }

  // 5. Extract Chapters
  const chapters: Array<{ number: number; title: string; url: string }> = [];

  if (is69shuba && catalogUrl !== mainUrl) {
    // For 69shuba: Fetch dedicated catalog page which contains all 100% chapters
    try {
      const { html: catHtml } = await fetchHtmlWithCookies({ url: catalogUrl, cookieConfig });
      const $cat = cheerio.load(catHtml);
      extractChaptersFromCheerio($cat, config, catalogUrl, chapters);
    } catch {
      // Fallback to main page if catalog page fails
      extractChaptersFromCheerio($, config, url, chapters);
    }
  } else {
    // Normal extraction on current page
    extractChaptersFromCheerio($, config, url, chapters);
  }

  // Automatic catalog page detection for other sites if initial page has few chapters (e.g. only latest 5-10 chapters)
  if (chapters.length <= 10) {
    const catalogLinkTag = $(
      'a:contains("完整目录"), a:contains("全部章节"), a:contains("所有章节"), a:contains("查看目录"), a:contains("章节目录"), a:contains("Mục lục đầy đủ"), a:contains("Xem tất cả"), a[href*="/catalog/"], a[href*="/mulu/"], a[href*="/all/"]'
    ).first();
    const catHref = catalogLinkTag.attr('href');
    if (catHref && !catHref.startsWith('javascript:') && catHref !== '#') {
      try {
        const fullCatUrl = new URL(catHref, url).href;
        if (fullCatUrl !== url) {
          const { html: catHtml } = await fetchHtmlWithCookies({ url: fullCatUrl, cookieConfig });
          const $cat = cheerio.load(catHtml);
          const fullChapters: Array<{ number: number; title: string; url: string }> = [];
          extractChaptersFromCheerio($cat, config, fullCatUrl, fullChapters);
          if (fullChapters.length > chapters.length) {
            chapters.length = 0;
            chapters.push(...fullChapters);
          }
        }
      } catch {
        // non-fatal
      }
    }
  }

  // 6. Multi-page Pagination Handling (for TruyenFull, Metruyenchu, etc.)
  const maxPagesToFetch = options?.maxPages ?? 150;
  const { pageUrls, totalPages } = detectPaginationPages($, config, url, maxPagesToFetch);

  // Fast chunked parallel fetching with concurrency of 6 pages at a time
  if (options?.fetchAllPages !== false && pageUrls.length > 0) {
    const BATCH_SIZE = 6;
    for (let i = 0; i < pageUrls.length; i += BATCH_SIZE) {
      const chunk = pageUrls.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.allSettled(
        chunk.map(pageUrl =>
          fetchHtmlWithCookies({ url: pageUrl, cookieConfig, timeoutMs: 12000 })
            .then(res => ({ pageUrl, html: res.html }))
        )
      );

      for (const res of chunkResults) {
        if (res.status === 'fulfilled' && res.value.html) {
          try {
            const page$ = cheerio.load(res.value.html);
            extractChaptersFromCheerio(page$, config, res.value.pageUrl, chapters);
          } catch {
            // Continue with other pages
          }
        }
      }

      // Small break between chunks to prevent server rate limiting
      if (i + BATCH_SIZE < pageUrls.length) {
        await new Promise(r => setTimeout(r, 60));
      }
    }
  }

  // Check if chapters are listed in reverse chronological order (common on 69shuba where chapter 568 is listed before chapter 1)
  if (chapters.length > 1) {
    const firstNum = chapters[0].number;
    const lastNum = chapters[chapters.length - 1].number;
    if (firstNum && lastNum && firstNum > lastNum) {
      chapters.reverse();
    }
  }

  // Sort chapters strictly by chapter number
  chapters.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  chapters.forEach((ch, idx) => {
    ch.number = idx + 1;
    ch.title = cleanChapterTitle(ch.title, ch.number);
  });

  return {
    title: title || 'Truyện không tên',
    author: author || 'Khuyết danh',
    description: description || 'Không có tóm tắt giới thiệu.',
    coverUrl: coverUrl || '',
    totalPages: Math.max(totalPages, 1),
    chapters,
  };
}

/**
 * Scrape a single chapter text
 */
export async function scrapeChapterContent(
  chapterUrl: string,
  cookieConfig?: CookieConfig,
  customConfig?: CrawlerConfig
): Promise<ChapterContentResult> {
  const { html } = await fetchHtmlWithCookies({ url: chapterUrl, cookieConfig });
  const $ = cheerio.load(html);
  const preset = findPresetForUrl(chapterUrl);
  const config = { ...preset.config, ...(customConfig || {}) };

  // 1. Extract Chapter Title FIRST before removing any tags
  let title = '';
  if (config.chapterTitleSelector) {
    title = $(config.chapterTitleSelector).first().text().trim();
  }
  if (!title) {
    title = $('h1, h2, .chapter-title, .title').first().text().trim();
  }
  if (!title) {
    title = $('title').text().trim().replace(/\s*[-|_].*$/, '');
  }
  title = cleanChapterTitle(title);

  // 2. Remove unwanted elements & advertisement wrappers
  const excludes = config.excludeSelectors || [
    'script', 'style', 'iframe', '.ads', '.advertisement', '.social-share',
    '.novel_attention', 'div.contentadv', '.bottom-ad', '.ads-holder',
    'button', '.btn', '.navigation', '.prev-next', '#comment', '.comment-section',
    '.watermark', '.source-note', '.chapter-source', '.signature', '.post-tail',
    '.source', '.copyright', '.tail-info', '.ad-box', '.ad-container', '.reading-footer',
    '.txtinfo', '#txtright'
  ];
  $(excludes.join(', ')).remove();

  // Also remove h1 and h2 from content containers so title is not duplicated in text
  $('h1, h2, .chapter-title').remove();

  // 3. Extract Content
  let contentHtml = '';
  if (config.chapterContentSelector) {
    contentHtml = $(config.chapterContentSelector).first().html() || '';
  }

  // Fallback heuristics if selector didn't match
  if (!contentHtml || contentHtml.trim().length < 50) {
    const candidates = [
      '#chapter-content', '.chapter-content', '.entry-content', '#content',
      '.content', '.txtnav', '#novel_honbun', '.reading-content', 'article'
    ];
    for (const selector of candidates) {
      const match = $(selector).first();
      if (match.length && (match.text().trim().length > 100)) {
        contentHtml = match.html() || '';
        break;
      }
    }
  }

  // If still empty, find the element with the largest text length
  if (!contentHtml || contentHtml.trim().length < 50) {
    let longestLength = 0;
    $('div, section, article').each((_, el) => {
      const textLen = $(el).text().trim().length;
      if (textLen > longestLength && !$(el).find('div, section, article').length) {
        longestLength = textLen;
        contentHtml = $(el).html() || '';
      }
    });
  }

  const cleanText = cleanContentHtml(contentHtml);
  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

  return {
    title: title || 'Chương không tên',
    content: cleanText,
    wordCount,
    rawHtml: contentHtml,
  };
}
