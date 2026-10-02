import { CrawlerConfig } from '@/types/novel';

export interface SitePreset {
  id: string;
  name: string;
  domainPattern: string; // Regex or substring
  exampleUrl: string;
  config: CrawlerConfig;
  defaultHeaders?: Record<string, string>;
  notes?: string;
}

export const SITE_PRESETS: SitePreset[] = [
  {
    id: 'syosetu',
    name: 'Syosetu (Shousetsuka ni Narou - Nhật)',
    domainPattern: 'syosetu.com',
    exampleUrl: 'https://ncode.syosetu.com/n2267be/',
    config: {
      titleSelector: '.novel_title, p.novel_title',
      authorSelector: '.novel_writername, .novel_writername a',
      descriptionSelector: '#novel_ex',
      chapterListSelector: '.novel_sublist2, .chapter_title',
      chapterLinkSelector: 'dd.subtitle a, .subtitle a',
      chapterTitleSelector: '.novel_subtitle',
      chapterContentSelector: '#novel_honbun',
      excludeSelectors: ['.novel_attention', 'script', 'style'],
      delayMs: 1200,
    },
    notes: 'Trang web tiểu thuyết mạng lớn nhất Nhật Bản. Thường không yêu cầu cookie trừ R18 (Nocturne).',
  },
  {
    id: '69shuba',
    name: '69Shuba (69 Thư Ba - Trung Raw)',
    domainPattern: '69shuba',
    exampleUrl: 'https://www.69shuba.cx/book/48123.htm',
    config: {
      titleSelector: '.booknav2 h1, .bookinfo h1',
      authorSelector: '.booknav2 p:nth-of-type(1) a, .bookinfo p a',
      descriptionSelector: '.navtxt, .bookintro',
      chapterListSelector: '#catalog ul li, .catalog ul li',
      chapterLinkSelector: 'a',
      chapterTitleSelector: '.txtnav h1, h1',
      chapterContentSelector: '.txtnav',
      excludeSelectors: ['div.contentadv', '.bottom-ad', 'script', 'style', '.txtnav h1'],
      delayMs: 1500,
    },
    notes: 'Kho convert truyện chữ Trung Quốc raw đồ sộ. Hỗ trợ cookie nếu bị Cloudflare kiểm tra.',
  },
  {
    id: 'biquge',
    name: 'Biquge (Bút Thú Các - Trung Raw)',
    domainPattern: 'biquge|biqubao|xbiquge',
    exampleUrl: 'https://www.xbiquge.la/7/7123/',
    config: {
      titleSelector: '#info h1',
      authorSelector: '#info p:contains("作") a, #info p:first-of-type',
      descriptionSelector: '#intro',
      chapterListSelector: '#list dd',
      chapterLinkSelector: 'a',
      chapterTitleSelector: '.bookname h1',
      chapterContentSelector: '#content',
      excludeSelectors: ['p.readinline', 'script', 'style'],
      delayMs: 1000,
    },
    notes: 'Trang truyện raw Bút Thú Các phổ biến.',
  },
  {
    id: 'truyenfull',
    name: 'TruyenFull (Việt Nam)',
    domainPattern: 'truyenfull',
    exampleUrl: 'https://truyenfull.io/truyen-sample/',
    config: {
      titleSelector: 'h3.title',
      authorSelector: '.info a[itemprop="author"]',
      coverSelector: '.book img',
      descriptionSelector: '.desc-text',
      chapterListSelector: '.list-chapter li',
      chapterLinkSelector: 'a',
      chapterTitleSelector: '.chapter-title',
      chapterContentSelector: '.chapter-c',
      excludeSelectors: ['script', 'style', 'div[align="center"]', '.ads-holder'],
      delayMs: 800,
    },
    notes: 'Trang đọc truyện dịch/convert tiếng Việt.',
  },
  {
    id: 'metruyenchu',
    name: 'Metruyenchu / TruyenCV (Việt Nam)',
    domainPattern: 'metruyenchu',
    exampleUrl: 'https://metruyenchu.com.vn/truyen-sample/',
    config: {
      titleSelector: 'h1.h3',
      authorSelector: 'a.text-secondary',
      descriptionSelector: '#nav-intro',
      chapterListSelector: '#nav-chap .list-unstyled li',
      chapterLinkSelector: 'a',
      chapterTitleSelector: 'h2.text-center, .chapter-title',
      chapterContentSelector: '#article',
      excludeSelectors: ['script', 'style', '.ads-holder'],
      delayMs: 1000,
    },
    notes: 'Cần cookie tài khoản nếu cào truyện VIP hoặc giới hạn chương.',
  },
  {
    id: 'novelfull',
    name: 'NovelFull (Tiếng Anh)',
    domainPattern: 'novelfull',
    exampleUrl: 'https://novelfull.net/sample-novel.html',
    config: {
      titleSelector: 'h3.title',
      authorSelector: '.info a[href*="/author/"]',
      coverSelector: '.book img',
      descriptionSelector: '.desc-text',
      chapterListSelector: '.list-chapter li',
      chapterLinkSelector: 'a',
      chapterTitleSelector: '.chapter-title, h2',
      chapterContentSelector: '#chapter-content',
      excludeSelectors: ['script', 'style', 'div[align="center"]', '.ads'],
      delayMs: 1000,
    },
    notes: 'Trang web dịch truyện Light Novel / Webnovel tiếng Anh hàng đầu.',
  },
  {
    id: 'generic',
    name: 'Tự động nhận diện (Generic / Mọi website)',
    domainPattern: '.*',
    exampleUrl: 'https://example-novel-site.com/book/123',
    config: {
      titleSelector: 'h1.novel-title, h1.book-title, h1.title, .entry-title, h1',
      authorSelector: '.author, .writer, [itemprop="author"], .novel-author',
      coverSelector: '.novel-cover img, .book-img img, .cover img, [itemprop="image"]',
      descriptionSelector: '.description, .summary, .intro, .novel-intro, .synopsis',
      chapterListSelector: '.chapter-list li, .chapters li, #chapter-list a, .catalog a',
      chapterLinkSelector: 'a',
      chapterTitleSelector: 'h1.chapter-title, h2.chapter-title, .reader-title, h1',
      chapterContentSelector: '#chapter-content, .chapter-content, .entry-content, #content, .content, article',
      excludeSelectors: ['script', 'style', 'iframe', '.ads', '.advertisement', '.social-share', '.navigation', '.btn', 'button'],
      delayMs: 1000,
    },
    notes: 'Hệ thống tự động phân tích cấu trúc DOM để bóc tách tiêu đề và nội dung.',
  },
];

export function findPresetForUrl(url: string): SitePreset {
  try {
    const hostname = new URL(url).hostname;
    for (const preset of SITE_PRESETS) {
      if (preset.id !== 'generic' && new RegExp(preset.domainPattern, 'i').test(hostname)) {
        return preset;
      }
    }
  } catch {
    // Invalid URL fallback
  }
  return SITE_PRESETS.find(p => p.id === 'generic') || SITE_PRESETS[0];
}
