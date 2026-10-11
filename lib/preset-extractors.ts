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
    domainPattern: '69shuba|69suba|69shu|69xinshu|69yuedu',
    exampleUrl: 'https://www.69shuba.com/book/90442.htm',
    config: {
      titleSelector: '.booknav2 h1 a, .booknav2 h1, .bookinfo h1, h1, meta[property="og:novel:book_name"], meta[property="og:title"]',
      authorSelector: '.booknav2 p a[href*="author"], .booknav2 p:first-of-type a, .bookinfo p a, meta[property="og:novel:author"]',
      coverSelector: '.bookimg2 img, .bookcover img, .cover img, .booknav2 img, meta[property="og:image"]',
      descriptionSelector: '.navtxt, .bookintro, meta[property="og:description"]',
      chapterListSelector: '#catalog ul li a, .catalog ul li a, #catalog a, .catalog a, a[href*="/txt/"], li[data-num] a, .qustime ul li a',
      chapterLinkSelector: 'a',
      chapterTitleSelector: '.txtnav h1, h1, .mytitle',
      chapterContentSelector: '.txtnav, #content, .content',
      excludeSelectors: [
        '.txtinfo', '#txtright', '.contentadv', '.bottom-ad', 'script', 'style',
        'div.ad', 'div.ads', 'ins', '.novel_attention', '.mybox .tools', '.yueduad1'
      ],
      delayMs: 1200,
    },
    notes: 'Kho convert truyện chữ Trung Quốc raw đồ sộ nhất. Tự động nhận diện và bóc tách toàn bộ mục lục và giải mã chuẩn GBK/GB18030.',
  },
  {
    id: 'biquge',
    name: 'Biquge (Bút Thú Các / Tân Bút Thú Các - Trung Raw)',
    domainPattern: 'biquge|biqubao|xbiquge|5200|ptwxz|piaotian|dingdian',
    exampleUrl: 'https://www.xbiquge.info/116/116322/',
    config: {
      titleSelector: 'meta[property="og:novel:book_name"], .book_info h1, #info h1, .book-info h1, h1, meta[property="og:title"]',
      authorSelector: 'meta[property="og:novel:author"], #info p:contains("作") a, .book_info a[href*="search"], #info p:first-of-type, .book-info .author a',
      coverSelector: 'meta[property="og:image"], .book_info img, #fmimg img, .book-img img, .cover img',
      descriptionSelector: 'meta[property="og:description"], #intro, .book-intro, .intro',
      chapterListSelector: '.book_list ul li a, .book_list2 ul li a, .book_list a, #list dd a, #list a, .listmain a, .catalog a',
      chapterLinkSelector: 'a',
      chapterTitleSelector: '.box.single h1, .bookname h1, h1',
      chapterContentSelector: 'article, .box.single article, #content, #chaptercontent, .content',
      paginationSelector: '.pagination, ul.pagination, #pagination, div.pagination, .page-nav, .page, .pages, .listpage',
      excludeSelectors: [
        'p.readinline', 'script', 'style', '.ad', '.ads', '.row.resetfontsize',
        '.row.nav-bottom', '#outer', '.options', '.icon-list'
      ],
      delayMs: 1000,
    },
    notes: 'Trang truyện raw Bút Thú Các và Tân Bút Thú Các (xbiquge.info, xbiquge.la). Hỗ trợ chuẩn xác UTF-8 và thẻ article.',
  },
  {
    id: 'novel543',
    name: 'Novel543 (稷下書院 - Jixia Academy - Trung Raw)',
    domainPattern: 'novel543',
    exampleUrl: 'https://www.novel543.com/0312506018/',
    config: {
      titleSelector: 'h1, meta[property="og:novel:book_name"], meta[property="og:title"]',
      authorSelector: '.media-content p:contains("作者") a, span:contains("作者"), .col p:contains("作者"), meta[property="og:novel:author"]',
      coverSelector: '.media-left img, .book-img img, img.cover, .media img, meta[property="og:image"]',
      descriptionSelector: '.intro, .description, #intro, .summary, meta[property="og:description"]',
      chapterListSelector: 'ul.all li a, .all li a, ul.flex.all li a, .chapter-list a, .chaplist a, a[href*=".html"]',
      chapterLinkSelector: 'a',
      chapterTitleSelector: 'h1, .content-title, .title',
      chapterContentSelector: '.content, article, #content',
      excludeSelectors: [
        'script', 'style', '.gadBlock', 'ins', '.ad', '.ads', 'a[href*="govip"]',
        'img[src*="vip.png"]', '.content-nav', '.navbar', '.footer', '.has-text-centered', '#outer'
      ],
      delayMs: 1000,
    },
    notes: 'Trang tiểu thuyết mạng Trung Quốc (稷下書院 - novel543.com). Hỗ trợ tự động bóc tách danh mục /dir, nội dung .content và tự động ghép các chương bị chia cắt nhiều trang (_1_2.html).',
  },
  {
    id: 'truyenfull',
    name: 'TruyenFull (Việt Nam)',
    domainPattern: 'truyenfull',
    exampleUrl: 'https://truyenfull.io/dau-pha-thuong-khung/',
    config: {
      titleSelector: 'h3.title, .truyen-title, h1.title, .title',
      authorSelector: '.info a[itemprop="author"], .info a[href*="/tac-gia/"], .info a[href*="/author/"]',
      coverSelector: '.book img, .info-holder .book img, .col-info-desc img',
      descriptionSelector: '.desc-text, .desc-text-full, div.desc-text',
      chapterListSelector: '.list-chapter a, #list-chapter a, ul.list-chapter li a, .list-chapters a, div.list-chapter a',
      chapterLinkSelector: 'a',
      chapterTitleSelector: '.chapter-title, h2.chapter-title',
      chapterContentSelector: '.chapter-c, #chapter-c',
      paginationSelector: '.pagination, ul.pagination, #pagination, div.pagination, select.select-chapter',
      excludeSelectors: ['script', 'style', 'div[align="center"]', '.ads-holder', '.ads', '.ad-container', 'div.adsbygoogle', '.banner'],
      delayMs: 600,
    },
    notes: 'Trang đọc truyện lớn nhất Việt Nam. Hỗ trợ tự động bóc tách tất cả các trang mục lục phân trang (Trang 1..N).',
  },
  {
    id: 'tangthuvien',
    name: 'Tang Thư Viện (Việt Nam)',
    domainPattern: 'truyen.tangthuvien|tangthuvien',
    exampleUrl: 'https://truyen.tangthuvien.vn/doc-truyen/sample',
    config: {
      titleSelector: 'h1.story-name, .story-info h1',
      authorSelector: '.story-info p a[href*="/tac-gia/"]',
      coverSelector: '.book-img img, .story-info img',
      descriptionSelector: '.book-intro, .story-intro',
      chapterListSelector: '.list-chapter a, #story-detail a[href*="/chuong-"], .chapter-list a',
      chapterLinkSelector: 'a',
      chapterTitleSelector: 'h2.chapter-title, .chapter-title',
      chapterContentSelector: '.box-chap, #box-chap',
      paginationSelector: '.pagination, .pager',
      excludeSelectors: ['script', 'style', '.ads-holder', '.ad'],
      delayMs: 800,
    },
    notes: 'Kho truyện tiên hiệp convert nổi tiếng tại Việt Nam.',
  },
  {
    id: 'metruyenchu',
    name: 'Metruyenchu / TruyenCV (Việt Nam)',
    domainPattern: 'metruyenchu',
    exampleUrl: 'https://metruyenchu.com.vn/truyen-sample/',
    config: {
      titleSelector: 'h1.h3, h1.title',
      authorSelector: 'a.text-secondary, a[href*="/tac-gia/"]',
      coverSelector: '.nh-thumb img, .book-thumb img',
      descriptionSelector: '#nav-intro, .intro-content',
      chapterListSelector: '#nav-chap .list-unstyled li a, #nav-chap a, .list-chapter a',
      chapterLinkSelector: 'a',
      chapterTitleSelector: 'h2.text-center, .chapter-title',
      chapterContentSelector: '#article, .reading-content',
      paginationSelector: '.pagination, ul.pagination, #pagination',
      excludeSelectors: ['script', 'style', '.ads-holder'],
      delayMs: 800,
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
      paginationSelector: '.pagination, ul.pagination',
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
      paginationSelector: '.pagination, .page-nav, ul.page, .pager, div.pages, nav[aria-label*="page"]',
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
