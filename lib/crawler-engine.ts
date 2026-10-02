import * as cheerio from 'cheerio';
import { CookieConfig, CrawlerConfig } from '@/types/novel';
import { findPresetForUrl } from './preset-extractors';

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
  chapters: Array<{
    number: number;
    title: string;
    url: string;
  }>;
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

    // Check content-type encoding if available (GBK / Big5 for Chinese raw sites)
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
 * Clean HTML element text into neat paragraphs
 */
function cleanContentHtml(html: string): string {
  // Replace <br> and <p> with newlines
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

  // Remove any remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Split into lines, trim each, and remove excessive empty lines
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return lines.join('\n\n');
}

/**
 * Inspect a novel main/table of contents URL and extract metadata
 */
export async function inspectNovel(url: string, cookieConfig?: CookieConfig, customConfig?: CrawlerConfig): Promise<NovelMetadata> {
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
    // Clean title from site suffixes like " - TruyenFull", " | Syosetu"
    title = title.replace(/\s*[-|_|–]\s*(TruyenFull|Metruyenchu|NovelFull|Syosetu|Biquge|69shuba|Đọc truyện).*$/i, '').trim();
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

  // 5. Extract Chapter List / TOC
  const chapters: Array<{ number: number; title: string; url: string }> = [];
  const parsedOrigin = new URL(url);

  // Common chapter link heuristics
  const chapterElements = $(config.chapterListSelector || '.chapter-list a, #chapter-list a, .list-chapter a, a[href*="chapter"], a[href*="chap"]');

  chapterElements.each((index, el) => {
    let linkTag = $(el);
    let href = linkTag.attr('href');

    // If chapterListSelector points to a container like <li>, find <a> inside
    if (!href && config.chapterLinkSelector) {
      const childLink = linkTag.find(config.chapterLinkSelector).first();
      if (childLink.length) {
        linkTag = childLink;
        href = childLink.attr('href');
      }
    }

    if (!href || href.startsWith('javascript:') || href === '#') return;

    // Resolve relative URL
    let fullUrl = href;
    try {
      fullUrl = new URL(href, url).href;
    } catch {
      return;
    }

    // Don't include non-chapter links (home, login, etc.)
    if (fullUrl === url || fullUrl === parsedOrigin.origin + '/') return;

    const chapTitle = linkTag.text().trim();
    if (!chapTitle) return;

    // Deduplicate by URL
    if (!chapters.some(c => c.url === fullUrl)) {
      chapters.push({
        number: chapters.length + 1,
        title: chapTitle,
        url: fullUrl,
      });
    }
  });

  return {
    title: title || 'Truyện không tên',
    author: author || 'Khuyết danh',
    description: description || 'Không có tóm tắt giới thiệu.',
    coverUrl: coverUrl || '',
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
    'button', '.btn', '.navigation', '.prev-next', '#comment', '.comment-section'
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
