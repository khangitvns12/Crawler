import * as cheerio from 'cheerio';
import { CookieConfig, CrawlerConfig } from '@/types/novel';
import { findPresetForUrl } from './preset-extractors';
import { cleanChapterTitle, cleanChapterContent, parseChapterNumber } from './chapter-utils';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface CrawlFetchOptions {
  url: string;
  cookieConfig?: CookieConfig;
  customHeaders?: Record<string, string>;
  timeoutMs?: number;
  skipMirrors?: boolean;
}

/**
 * Normalize novel URL, handle typos (e.g. 69suba -> 69shuba), and enforce valid schemes
 */
export function normalizeNovelUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // Map 69suba.com or any 69suba typo directly to www.69shuba.com
    if (/69suba/i.test(host)) {
      parsed.hostname = 'www.69shuba.com';
      return parsed.href;
    }

    // Ensure 69shuba uses https and www
    if (/^(69shuba\.com|69shu\.me|69xinshu\.com)$/i.test(host)) {
      parsed.hostname = 'www.' + host.replace(/^www\./i, '');
      return parsed.href;
    }

    // xbiquge: ensure xbiquge.info uses www.xbiquge.info
    if (host === 'xbiquge.info') {
      parsed.hostname = 'www.xbiquge.info';
      return parsed.href;
    }
  } catch {
    // ignore
  }
  return url;
}

/**
 * Get domain mirrors for anti-blocking resiliency on Cloudflare-protected sites
 */
export function getDomainMirrors(rawUrl: string): string[] {
  const normUrl = normalizeNovelUrl(rawUrl);
  const mirrors: string[] = [normUrl];
  try {
    const parsed = new URL(normUrl);
    const host = parsed.hostname.toLowerCase();

    // 69shuba / 69suba family
    if (/69shuba|69suba|69shu|69xinshu|69yuedu/i.test(host)) {
      const candidates = [
        'www.69shuba.com',
        '69shuba.cx',
        'www.69shu.me',
        'www.69xinshu.com',
        '69shuba.pro',
        'www.69yuedu.com',
      ];
      for (const m of candidates) {
        if (!host.includes(m)) {
          const alt = new URL(normUrl);
          alt.hostname = m;
          if (!mirrors.includes(alt.href)) {
            mirrors.push(alt.href);
          }
        }
      }
    }

    // xbiquge / biquge family
    if (/xbiquge|biquge|biqubao/i.test(host)) {
      const candidates = [
        'www.xbiquge.info',
        'www.xbiquge.la',
        'www.xbiquge.so',
        'www.biquge.tv',
        'www.biquge5200.cc',
        'xbiquge.bz',
      ];
      for (const m of candidates) {
        if (!host.includes(m)) {
          const alt = new URL(normUrl);
          alt.hostname = m;
          if (!mirrors.includes(alt.href)) {
            mirrors.push(alt.href);
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return mirrors;
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
 * Fetch HTML via intelligent fallback proxies when Cloudflare blocks serverless/cloud IPs
 */
async function fetchViaFallbackProxies(targetUrl: string, cookieConfig?: CookieConfig): Promise<string | null> {
  // 1. User custom proxy if defined
  if (cookieConfig?.customProxy?.trim()) {
    try {
      const customProxyTpl = cookieConfig.customProxy.trim();
      const proxyUrl = customProxyTpl.includes('{url}') || customProxyTpl.includes('{URL}')
        ? customProxyTpl.replace(/\{url\}/gi, encodeURIComponent(targetUrl))
        : `${customProxyTpl}${customProxyTpl.includes('?') ? '&' : '?'}url=${encodeURIComponent(targetUrl)}`;

      const res = await fetch(proxyUrl, {
        headers: { 'User-Agent': cookieConfig?.userAgent || DEFAULT_USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 200) return text;
      }
    } catch (err) {
      console.warn('[Proxy Fallback] Custom proxy failed:', err);
    }
  }

  // 2. Jina Reader (specialized headless reader proxy that bypasses Cloudflare WAF effortlessly)
  try {
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    const jinaRes = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
        'X-Return-Format': 'html',
        'X-No-Cache': 'true',
        'User-Agent': cookieConfig?.userAgent || DEFAULT_USER_AGENT,
      },
      signal: AbortSignal.timeout(18000),
    });
    if (jinaRes.ok) {
      const jinaText = await jinaRes.text();
      if (jinaText && jinaText.length > 250 && !jinaText.includes('Attention Required! | Cloudflare')) {
        return jinaText;
      }
    }
  } catch (err) {
    console.warn('[Proxy Fallback] Jina Reader fallback note:', err);
  }

  // 3. AllOrigins CORS Proxy
  try {
    const allOriginsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const aoRes = await fetch(allOriginsUrl, {
      signal: AbortSignal.timeout(12000),
    });
    if (aoRes.ok) {
      const aoText = await aoRes.text();
      if (aoText && aoText.length > 250) return aoText;
    }
  } catch {
    // non-fatal
  }

  // 4. CorsProxy.io
  try {
    const cpUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const cpRes = await fetch(cpUrl, {
      signal: AbortSignal.timeout(12000),
    });
    if (cpRes.ok) {
      const cpText = await cpRes.text();
      if (cpText && cpText.length > 250) return cpText;
    }
  } catch {
    // non-fatal
  }

  return null;
}

/**
 * Fetch HTML with full Cookie, browser spoofing headers, intelligent multi-encoding support,
 * and automatic Fallback Proxies when blocked by Cloudflare (403/503) on hosting platforms like GitHub/Vercel.
 */
export async function fetchHtmlWithCookies(options: CrawlFetchOptions): Promise<{
  html: string;
  status: number;
  headers: Record<string, string>;
  usedUrl?: string;
}> {
  const { url, cookieConfig, customHeaders, timeoutMs = 20000, skipMirrors = false } = options;

  const normalizedInputUrl = normalizeNovelUrl(url);
  const targetUrls = skipMirrors ? [normalizedInputUrl] : getDomainMirrors(normalizedInputUrl);
  let lastError: Error | null = null;
  let encounteredCloudflare = false;

  for (let idx = 0; idx < targetUrls.length; idx++) {
    const currentUrl = targetUrls[idx];
    
    let parsedOrigin = '';
    try {
      parsedOrigin = new URL(currentUrl).origin;
    } catch {
      // ignore
    }

    const headers: Record<string, string> = {
      'User-Agent': cookieConfig?.userAgent || DEFAULT_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,vi;q=0.6',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      ...(customHeaders || {}),
    };

    if (cookieConfig?.cookieString?.trim()) {
      headers['Cookie'] = cookieConfig.cookieString.trim();
    }

    if (cookieConfig?.referer) {
      headers['Referer'] = cookieConfig.referer;
    } else if (parsedOrigin) {
      headers['Referer'] = parsedOrigin;
    }

    if (cookieConfig?.customHeaders) {
      Object.assign(headers, cookieConfig.customHeaders);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
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

      // Known GBK Chinese novel sites (69shuba, 5200, ptwxz, etc.)
      const isKnownGbkSite = /69shuba|69suba|69shu|69xinshu|69yuedu|5200|ptwxz|piaotian|bxwx|uukanshu|77xsw|dingdian/i.test(currentUrl);
      const isKnownJapaneseSite = /syosetu|kakuyomu|alphapolis|hameln/i.test(currentUrl);

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
      let targetEncoding = 'utf-8';
      if (contentTypeLower.includes('gbk') || contentTypeLower.includes('gb2312') || contentTypeLower.includes('gb18030')) {
        targetEncoding = 'gb18030';
      } else if (contentTypeLower.includes('shift_jis') || contentTypeLower.includes('shift-jis') || contentTypeLower.includes('sjis')) {
        targetEncoding = 'shift_jis';
      } else if (contentTypeLower.includes('euc-jp')) {
        targetEncoding = 'euc-jp';
      } else if (contentTypeLower.includes('big5')) {
        targetEncoding = 'big5';
      } else if (contentTypeLower.includes('utf-8')) {
        targetEncoding = 'utf-8';
      } else if (detectedEncoding === 'gb18030' || detectedEncoding === 'gbk' || detectedEncoding === 'gb2312') {
        targetEncoding = 'gb18030';
      } else if (detectedEncoding && detectedEncoding !== 'utf-8') {
        targetEncoding = detectedEncoding;
      } else if (detectedEncoding === 'utf-8') {
        targetEncoding = 'utf-8';
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

      // Verify and resolve Mojibake: If decoded string contains replacement characters (\uFFFD), test alternative
      const repCount = (html.match(/\uFFFD/g) || []).length;
      if (repCount > 5) {
        const altEncoding = targetEncoding === 'gb18030' ? 'utf-8' : 'gb18030';
        try {
          const altDecoder = new TextDecoder(altEncoding);
          const altHtml = altDecoder.decode(arrayBuffer);
          const altRepCount = (altHtml.match(/\uFFFD/g) || []).length;
          if (altRepCount < repCount) {
            html = altHtml;
          }
        } catch {
          // ignore
        }
      }

      // Check if response is blocked by Cloudflare (403 or "Just a moment...")
      const isCloudflareBlocked = status === 403 || status === 503 ||
        html.includes('cf-browser-verification') ||
        html.includes('Just a moment...') ||
        html.includes('Attention Required! | Cloudflare');

      if (isCloudflareBlocked) {
        encounteredCloudflare = true;
        if (idx < targetUrls.length - 1) {
          lastError = new Error(`Máy chủ ${currentUrl} yêu cầu xác thực Cloudflare (HTTP ${status})`);
          continue;
        }
      } else {
        return { html, status, headers: responseHeaders, usedUrl: currentUrl };
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));
      if (idx < targetUrls.length - 1) {
        continue;
      }
    }
  }

  // >>> AUTO PROXY FALLBACK PIPELINE <<<
  // If direct mirror requests failed or were blocked by Cloudflare (common when deployed on cloud/GitHub/Vercel)
  if (encounteredCloudflare || lastError) {
    console.warn(`[Crawler] Direct connection to ${normalizedInputUrl} blocked or failed. Activating Fallback Proxy...`);
    const fallbackHtml = await fetchViaFallbackProxies(targetUrls[0] || normalizedInputUrl, cookieConfig);
    if (fallbackHtml) {
      return {
        html: fallbackHtml,
        status: 200,
        headers: {},
        usedUrl: targetUrls[0] || normalizedInputUrl,
      };
    }
  }

  const errorMsg = lastError ? lastError.message : 'Không rõ lỗi';
  throw new Error(
    `Lỗi kết nối tới ${url}: ${errorMsg}. Khi deploy lên Cloud/GitHub/Vercel bị Cloudflare chặn IP máy chủ, bạn có thể nhập Cookie & User-Agent vào Cấu hình Cookie VIP hoặc cung cấp Proxy trung gian.`
  );
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

  // Remove pagination markers like 第(1/3)页, (第1/3页)
  text = text
    .replace(/第\s*\(\s*\d+\s*[\/／]\s*\d+\s*\)\s*页/gi, '')
    .replace(/\(\s*第\s*\d+\s*[\/／]\s*\d+\s*页\s*\)/gi, '')
    .replace(/本章未完，请点击下一页继续阅读/gi, '');

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
    '.book_list ul li a',
    '.book_list2 ul li a',
    '.book_list a',
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
    if (cleanUrl.match(/\/index(?:[_-]\d+)?\.html?$/i)) return; // pagination catalog page itself (xbiquge/biquge)
    if (cleanUrl.match(/\/book\/\d+(\.htm|\/)?$/i)) return; // novel index/catalog page itself
    if (/69shuba|69suba|69shu|69xinshu|69yuedu/i.test(cleanUrl) && !cleanUrl.includes('/txt/')) return;

    // Extract chapter title
    let chapTitle = linkTag.text().trim();
    const attrTitle = linkTag.attr('title')?.trim();
    if (attrTitle && (chapTitle.length < 3 || /^\d+$/.test(chapTitle))) {
      chapTitle = attrTitle;
    }

    // Skip utility buttons like "完整目录", "开始阅读", "书架", etc.
    if (/^(?:完整目录|开始阅读|我的书架|加入书架|返回书页|章节目录|投票推荐|目录|倒序)$/i.test(chapTitle)) {
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
  maxPages: number = 500
): { pageUrls: string[]; totalPages: number } {
  const pageUrls: string[] = [];
  let detectedTotalPages = 1;

  // 1. Check TruyenFull's hidden inputs or attributes
  const totalPageInputs = $(
    'input#total-page, input[name="total-page"], input#total_page, [data-total-page], [data-pages], input#truyen-total-page'
  );
  totalPageInputs.each((_, el) => {
    const val = parseInt($(el).val() as string || $(el).attr('data-total-page') || $(el).attr('data-pages') || '1', 10);
    if (!isNaN(val) && val > detectedTotalPages) {
      detectedTotalPages = val;
    }
  });

  // 2. Check <select> dropdown for chapters/pages (common on Chinese & Vietnamese novel sites)
  $('select.select-chapter option, select[name*="page"] option, select[id*="page"] option, select[name*="index"] option, select[id*="index"] option, select.form-control option, select option').each((_, el) => {
    const optVal = $(el).attr('value') || '';
    const optText = $(el).text() || '';
    const m = optVal.match(/\/trang-(\d+)/i) ||
              optVal.match(/index[_-](\d+)\.html/i) ||
              optVal.match(/[?&]page=(\d+)/i) ||
              optVal.match(/[?&]p=(\d+)/i) ||
              optText.match(/trang\s*(\d+)/i) ||
              optText.match(/第\s*(\d+)\s*页/i) ||
              optText.match(/page\s*(\d+)/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > detectedTotalPages && num < 25000) detectedTotalPages = num;
    }
  });

  // 3. Scan all pagination containers
  const paginationElements = $(
    config.paginationSelector ||
    '.pagination, ul.pagination, #pagination, div.pagination, .page-nav, #page_nav, .pagelink, #pagelink, .pagelist, #pagelist, .pagebox, #pagebox, .index_page, #index_page, .showpage, ul.page, .pager, div.pages, .page, .pages, .listpage, nav[aria-label*="page"]'
  );

  // 3.1 Check ratio/fractional page text like "1/3", "第1/3页", "Trang 1/5"
  paginationElements.find('*').each((_, el) => {
    const t = $(el).text().trim();
    const m = t.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      const total = parseInt(m[2], 10);
      if (total > detectedTotalPages && total < 25000) {
        detectedTotalPages = total;
      }
    }
  });

  const foundLinks: Array<{ href: string; text: string }> = [];
  // Scan links inside pagination containers plus any explicit pagination links anywhere on the page (e.g. xbiquge index_2.html)
  const candidateLinks = paginationElements.find('a').add('a[href*="index_"], a[href*="index-"], a[href*="trang-"], a[href*="page="]');
  candidateLinks.each((_, el) => {
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

  let pagePattern: 'trang-slug' | 'query-page' | 'query-p' | 'page-slug' | 'index-html' | 'underscore-html' | 'discrete' = 'discrete';
  let patternTemplate = '';

  for (const { href, text } of foundLinks) {
    const isLastLink = /cuối|last|trang cuối|>>|末页|尾页/i.test(text);

    // xbiquge pattern: /135/135260/index_2.html, index_3.html, etc.
    const matchIndexHtml = href.match(/(.*\/index[_-]?)(\d+)(\.html?.*)$/i);
    if (matchIndexHtml) {
      const num = parseInt(matchIndexHtml[2], 10);
      if (num > detectedTotalPages) detectedTotalPages = num;
      pagePattern = 'index-html';
      patternTemplate = `${matchIndexHtml[1]}{PAGE}${matchIndexHtml[3]}`;
      continue;
    }

    const matchUnderscore = href.match(/(.*[_-])(\d+)(\.html?.*)$/i);
    if (matchUnderscore) {
      const num = parseInt(matchUnderscore[2], 10);
      if (num > detectedTotalPages) detectedTotalPages = num;
      pagePattern = 'underscore-html';
      patternTemplate = `${matchUnderscore[1]}{PAGE}${matchUnderscore[3]}`;
      continue;
    }

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

    // Direct numeric link text e.g. <a href="...">2</a>, <a href="...">3</a>
    const pureNum = parseInt(text, 10);
    if (!isNaN(pureNum) && pureNum > detectedTotalPages && pureNum < 25000) {
      detectedTotalPages = pureNum;
    }

    if (isLastLink) {
      const numMatch = href.match(/(\d+)/g);
      if (numMatch) {
        const lastNum = parseInt(numMatch[numMatch.length - 1], 10);
        if (lastNum > detectedTotalPages && lastNum < 25000) {
          detectedTotalPages = lastNum;
        }
      }
    }
  }

  if (initialUrl.includes('truyenfull') && pagePattern === 'discrete') {
    pagePattern = 'trang-slug';
  }

  const limitPages = Math.min(detectedTotalPages, maxPages);

  const cleanBase = initialUrl
    .split('#')[0]
    .replace(/\/index(?:[_-]\d+)?\.html?$/i, '')
    .replace(/\/trang-\d+\/?$/i, '')
    .replace(/\/page\/\d+\/?$/i, '')
    .replace(/[?&](page|p)=\d+/i, '')
    .replace(/\/+$/, '');

  if ((pagePattern === 'index-html' || pagePattern === 'underscore-html') && limitPages > 1) {
    for (let p = 2; p <= limitPages; p++) {
      if (patternTemplate && patternTemplate.includes('{PAGE}')) {
        const targetHref = patternTemplate.replace('{PAGE}', p.toString());
        try {
          pageUrls.push(new URL(targetHref, initialUrl).href);
        } catch {
          pageUrls.push(`${cleanBase}/index_${p}.html`);
        }
      } else {
        pageUrls.push(`${cleanBase}/index_${p}.html`);
      }
    }
  } else if (pagePattern === 'trang-slug' && limitPages > 1) {
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

  if (pageUrls.length === 0 && detectedTotalPages > 1) {
    for (let p = 2; p <= limitPages; p++) {
      pageUrls.push(`${cleanBase}/trang-${p}/`);
    }
  }

  return { pageUrls, totalPages: Math.max(detectedTotalPages, pageUrls.length + 1) };
}

/**
 * Inspect a novel main/table of contents URL and extract metadata
 */
export async function inspectNovel(
  url: string,
  cookieConfig?: CookieConfig,
  customConfig?: CrawlerConfig,
  options?: { fetchAllPages?: boolean; maxPages?: number }
): Promise<NovelMetadata> {
  const normalizedUrl = normalizeNovelUrl(url);
  const is69shuba = /69shuba|69suba|69shu|69xinshu|69yuedu/i.test(normalizedUrl);
  const preset = findPresetForUrl(normalizedUrl);
  const config = { ...preset.config, ...(customConfig || {}) };

  let mainUrl = normalizedUrl;
  let catalogUrl = normalizedUrl;
  let detailUrl = normalizedUrl;

  // 69shuba URL normalization: book page (/book/{id}.htm) has metadata, catalog (/book/{id}/) has ALL chapters
  if (is69shuba) {
    try {
      const parsedUrl = new URL(normalizedUrl);
      const hostname = parsedUrl.hostname;
      const bookIdMatch = normalizedUrl.match(/(?:book|txt)\/(\d+)/i);
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

  // xbiquge URL normalization: strip /index_2.html so inspection starts at base catalog page
  if (/xbiquge|biquge/i.test(normalizedUrl)) {
    if (/\/index(?:_\d+)?\.html?$/i.test(mainUrl)) {
      mainUrl = mainUrl.replace(/\/index(?:_\d+)?\.html?$/i, '/');
      catalogUrl = mainUrl;
      detailUrl = mainUrl;
    }
  }

  const { html, usedUrl } = await fetchHtmlWithCookies({ url: mainUrl, cookieConfig });
  const activeBaseUrl = usedUrl || mainUrl;
  const $ = cheerio.load(html);

  // 1. Extract Title
  let title = '';
  if (config.titleSelector) {
    const titleEl = $(config.titleSelector).first();
    title = (titleEl.is('meta') ? titleEl.attr('content') : titleEl.text())?.trim() || '';
  }
  if (!title) {
    title = $('meta[property="og:novel:book_name"]').attr('content') ||
            $('meta[property="og:title"]').attr('content') ||
            $('title').text().trim();
  }
  if (title) {
    title = title
      .replace(/\s*[-|_|–]\s*(TruyenFull|Metruyenchu|Tangthuvien|NovelFull|Syosetu|Biquge|69shuba|69shu|新笔趣阁.*|Đọc truyện).*$/i, '')
      .replace(/目录最新章节.*$/i, '')
      .replace(/最新章节.*$/i, '')
      .replace(/全文免费阅读.*$/i, '')
      .trim();
  }

  // 2. Extract Author
  let author = 'Chưa rõ tác giả';
  if (config.authorSelector) {
    const authorEl = $(config.authorSelector).first();
    const rawAuthor = (authorEl.is('meta') ? authorEl.attr('content') : authorEl.text())?.trim();
    if (rawAuthor) {
      author = rawAuthor.replace(/^(Tác giả|Author|作者|Writer)[:：\s]*/i, '').trim();
    }
  }
  if (!author || author === 'Chưa rõ tác giả') {
    const metaAuthor = $('meta[property="og:novel:author"]').attr('content') ||
                       $('meta[name="author"]').attr('content') ||
                       $('meta[property="book:author"]').attr('content') ||
                       $('meta[property="novel:author"]').attr('content');
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
    const coverEl = $(config.coverSelector).first();
    coverUrl = (coverEl.is('meta') ? coverEl.attr('content') : (coverEl.attr('src') || coverEl.attr('data-src'))) || '';
  }
  if (!coverUrl) {
    coverUrl = $('meta[property="og:image"]').attr('content') || '';
  }
  if (coverUrl.startsWith('//')) {
    coverUrl = 'https:' + coverUrl;
  } else if (coverUrl && !coverUrl.startsWith('http')) {
    try {
      coverUrl = new URL(coverUrl, activeBaseUrl).href;
    } catch {
      // ignore
    }
  }

  // 5. Extract Chapters
  const chapters: Array<{ number: number; title: string; url: string }> = [];

  if (is69shuba && catalogUrl !== mainUrl) {
    // For 69shuba: Fetch dedicated catalog page which contains all 100% chapters
    try {
      const { html: catHtml, usedUrl: catUsedUrl } = await fetchHtmlWithCookies({ url: catalogUrl, cookieConfig });
      const $cat = cheerio.load(catHtml);
      extractChaptersFromCheerio($cat, config, catUsedUrl || catalogUrl, chapters);
    } catch {
      // Fallback to main page if catalog page fails
      extractChaptersFromCheerio($, config, activeBaseUrl, chapters);
    }
  } else {
    // Normal extraction on current page
    extractChaptersFromCheerio($, config, activeBaseUrl, chapters);
  }

  // Automatic catalog page detection for other sites if initial page has few chapters (e.g. only latest 5-10 chapters)
  if (chapters.length <= 10) {
    const catalogLinkTag = $(
      'a:contains("完整目录"), a:contains("全部章节"), a:contains("所有章节"), a:contains("查看目录"), a:contains("章节目录"), a:contains("Mục lục đầy đủ"), a:contains("Xem tất cả"), a[href*="/catalog/"], a[href*="/mulu/"], a[href*="/all/"]'
    ).first();
    const catHref = catalogLinkTag.attr('href');
    if (catHref && !catHref.startsWith('javascript:') && catHref !== '#') {
      try {
        const fullCatUrl = new URL(catHref, activeBaseUrl).href;
        if (fullCatUrl !== activeBaseUrl) {
          const { html: catHtml, usedUrl: catUsedUrl } = await fetchHtmlWithCookies({ url: fullCatUrl, cookieConfig });
          const $cat = cheerio.load(catHtml);
          const fullChapters: Array<{ number: number; title: string; url: string }> = [];
          extractChaptersFromCheerio($cat, config, catUsedUrl || fullCatUrl, fullChapters);
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
  const maxPagesToFetch = options?.maxPages ?? 500;
  const { pageUrls, totalPages } = detectPaginationPages($, config, activeBaseUrl, maxPagesToFetch);

  // Fast chunked parallel fetching with concurrency of 6 pages at a time
  if (options?.fetchAllPages !== false && pageUrls.length > 0) {
    const BATCH_SIZE = 6;
    for (let i = 0; i < pageUrls.length; i += BATCH_SIZE) {
      const chunk = pageUrls.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.allSettled(
        chunk.map(pageUrl =>
          fetchHtmlWithCookies({ url: pageUrl, cookieConfig, timeoutMs: 12000 })
            .then(res => ({ pageUrl: res.usedUrl || pageUrl, html: res.html }))
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

      if (i + BATCH_SIZE < pageUrls.length) {
        await new Promise(r => setTimeout(r, 60));
      }
    }
  }

  // Check if chapters are listed in reverse chronological order (common on 69shuba)
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
 * Scrape a single chapter text with support for xbiquge/biquge multi-page chapters (e.g. 26427_2.html)
 */
export async function scrapeChapterContent(
  chapterUrl: string,
  cookieConfig?: CookieConfig,
  customConfig?: CrawlerConfig
): Promise<ChapterContentResult> {
  const normalizedChapterUrl = normalizeNovelUrl(chapterUrl);
  const { html, usedUrl } = await fetchHtmlWithCookies({ url: normalizedChapterUrl, cookieConfig });
  const activeChapterUrl = usedUrl || normalizedChapterUrl;
  const $ = cheerio.load(html);
  const preset = findPresetForUrl(activeChapterUrl);
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
    '.txtinfo', '#txtright', '.row.resetfontsize', '.row.nav-bottom', '#outer'
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

  // 4. Check for multi-page chapter continuation (xbiquge/biquge style: e.g. 26427_2.html, 26427_3.html)
  const isBiqugeFamily = /xbiquge|biquge|biqubao/i.test(activeChapterUrl);
  if (isBiqugeFamily) {
    let currentPartUrl = activeChapterUrl;
    let current$ = $;
    let partNum = 2;
    const maxParts = 10;

    // Extract base slug of current chapter, e.g. "26427" from "/116/116322/26427.html" or "26427_2.html"
    const chapterSlugMatch = activeChapterUrl.match(/\/(\d+)(?:_\d+)?\.html/i);
    const chapterSlug = chapterSlugMatch ? chapterSlugMatch[1] : '';

    while (partNum <= maxParts) {
      // Find the next subpage continuation link
      const nextLink = current$('#next, a#next, a#next1, a:contains("下一章"), a:contains("下一页"), a:contains("下一頁")')
        .filter((_, el) => {
          const h = current$(el).attr('href') || '';
          if (chapterSlug) {
            return new RegExp(`${chapterSlug}_\\d+\\.html`, 'i').test(h);
          }
          return /_\d+\.html/i.test(h);
        })
        .first();

      const nextHref = nextLink.attr('href');
      if (!nextHref) break;

      let nextPartFull = '';
      try {
        nextPartFull = new URL(nextHref, currentPartUrl).href;
      } catch {
        break;
      }

      if (nextPartFull === currentPartUrl) break;

      try {
        const { html: nextHtml } = await fetchHtmlWithCookies({
          url: nextPartFull,
          cookieConfig,
          skipMirrors: true,
        });
        const next$ = cheerio.load(nextHtml);
        next$('script, style, .row.nav-bottom, .row.resetfontsize, #outer, .ad, .ads, h1, h2').remove();
        const partContent = next$(config.chapterContentSelector || 'article, #content').first().html() || '';
        if (partContent) {
          contentHtml += '\n\n' + partContent;
        }
        currentPartUrl = nextPartFull;
        current$ = next$;
        partNum++;
      } catch {
        break;
      }
    }
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
