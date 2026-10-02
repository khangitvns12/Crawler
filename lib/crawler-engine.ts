import * as cheerio from 'cheerio';
import { CookieConfig, CrawlerConfig } from '@/types/novel';
import { findPresetForUrl } from './preset-extractors';
import { cleanChapterTitle, cleanChapterContent } from './chapter-utils';

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
 * Fetch HTML with full Cookie and custom headers support
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
    let html = '';

    if (contentType.toLowerCase().includes('gbk') || contentType.toLowerCase().includes('gb2312')) {
      const arrayBuffer = await response.arrayBuffer();
      try {
        const decoder = new TextDecoder('gb18030');
        html = decoder.decode(arrayBuffer);
      } catch {
        const fallbackDecoder = new TextDecoder('utf-8');
        html = fallbackDecoder.decode(arrayBuffer);
      }
    } else if (contentType.toLowerCase().includes('shift_jis') || contentType.toLowerCase().includes('euc-jp')) {
      const arrayBuffer = await response.arrayBuffer();
      try {
        const decoder = new TextDecoder('shift_jis');
        html = decoder.decode(arrayBuffer);
      } catch {
        const fallbackDecoder = new TextDecoder('utf-8');
        html = fallbackDecoder.decode(arrayBuffer);
      }
    } else {
      html = await response.text();
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
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  text = text.replace(/<[^>]+>/g, '');

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

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
    '.list-chapter a',
    '#list-chapter a',
    '.chapter-list a',
    '#chapter-list a',
    'ul.list-chapter li a',
    '#list-chapter li a',
    '.list-chapters a',
    '#chapters-list a',
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

    // Filter out non-chapter links (navigation, author, categories)
    if (cleanUrl.match(/\/(the-loai|tac-gia|danh-sach|page|author|category|tag)\//i)) return;
    if (cleanUrl.match(/\/trang-\d+\/?$/i)) return; // pagination page itself

    // Extract chapter title
    let chapTitle = linkTag.text().trim();
    const attrTitle = linkTag.attr('title')?.trim();
    if (attrTitle && (chapTitle.length < 3 || /^\d+$/.test(chapTitle))) {
      chapTitle = attrTitle;
    }

    // Remove noisy icons, badges or leading symbols and clean duplicate chapter prefixes
    chapTitle = cleanChapterTitle(chapTitle, chapters.length + 1);
    if (!chapTitle) return;

    // Deduplicate by clean canonical URL
    if (!chapters.some(c => c.url.split('#')[0] === cleanUrl)) {
      chapters.push({
        number: chapters.length + 1,
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
 * Inspect a novel main/table of contents URL and extract metadata (with Multi-page Pagination support)
 */
export async function inspectNovel(
  url: string,
  cookieConfig?: CookieConfig,
  customConfig?: CrawlerConfig,
  options?: { fetchAllPages?: boolean; maxPages?: number }
): Promise<NovelMetadata> {
  const { html } = await fetchHtmlWithCookies({ url, cookieConfig });
  const $ = cheerio.load(html);
  const preset = findPresetForUrl(url);
  const config = { ...preset.config, ...(customConfig || {}) };

  // 1. Extract Title
  let title = '';
  if (config.titleSelector) {
    title = $(config.titleSelector).first().text().trim();
  }
  if (!title) {
    title = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    title = title.replace(/\s*[-|_|–]\s*(TruyenFull|Metruyenchu|Tangthuvien|NovelFull|Syosetu|Biquge|69shuba|Đọc truyện).*$/i, '').trim();
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

  // 5. Extract Chapters on Page 1
  const chapters: Array<{ number: number; title: string; url: string }> = [];
  extractChaptersFromCheerio($, config, url, chapters);

  // 6. Multi-page Pagination Handling
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

  // Sort chapters naturally and renumber chapters sequentially and clean title prefixes
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
    totalPages,
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

  // Remove unwanted elements first
  const excludes = config.excludeSelectors || [
    'script', 'style', 'iframe', '.ads', '.advertisement', '.social-share',
    '.novel_attention', 'div.contentadv', '.bottom-ad', '.ads-holder',
    'button', '.btn', '.navigation', '.prev-next', '#comment', '.comment-section',
    '.watermark', '.source-note', '.chapter-source', '.signature', '.post-tail',
    '.source', '.copyright', '.tail-info', '.ad-box', '.ad-container', '.reading-footer'
  ];
  $(excludes.join(', ')).remove();

  // 1. Extract Chapter Title
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

  // Clean duplicate prefixes like "Chương 1: Chương 1:"
  title = cleanChapterTitle(title);

  // 2. Extract Content
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
