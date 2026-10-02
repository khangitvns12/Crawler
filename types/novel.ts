export type LanguageCode = 'zh' | 'ja' | 'ko' | 'en' | 'vi' | 'auto';

export type TranslationGenre = 
  | 'xianxia'     // Tiên hiệp / Kiếm hiệp / Huyền huyễn
  | 'modern'      // Đô thị / Ngôn tình / Hiện đại
  | 'lightnovel'  // Light Novel Nhật Bản
  | 'webnovel'    // Web novel phương Tây / Khoa huyễn
  | 'general';    // Văn phong tiêu chuẩn

export interface CookieConfig {
  cookieString: string;
  userAgent?: string;
  referer?: string;
  customHeaders?: Record<string, string>;
}

export interface CrawlerConfig {
  titleSelector?: string;
  authorSelector?: string;
  coverSelector?: string;
  descriptionSelector?: string;
  chapterListSelector?: string;
  chapterLinkSelector?: string;
  chapterTitleSelector?: string;
  chapterContentSelector?: string;
  nextPageSelector?: string;
  excludeSelectors?: string[];
  delayMs?: number;
}

export interface Chapter {
  id: string;
  novelId: string;
  chapterNumber: number;
  title: string;
  translatedTitle?: string;
  sourceUrl: string;
  rawContent: string;
  translatedContent?: string;
  translationStatus: 'pending' | 'translating' | 'translated' | 'error';
  translationError?: string;
  translatedAt?: string;
  wordCount: number;
  createdAt: string;
}

export interface Novel {
  id: string;
  title: string;
  originalTitle?: string;
  author: string;
  description: string;
  coverUrl: string;
  sourceUrl: string;
  sourceDomain: string;
  originalLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  status: 'ongoing' | 'completed' | 'crawling' | 'paused';
  chaptersCount: number;
  translatedChaptersCount: number;
  lastReadChapterNumber?: number;
  cookieConfig?: CookieConfig;
  crawlerConfig?: CrawlerConfig;
  glossary?: Record<string, string>; // Thuật ngữ dịch truyện riêng
  translationGenre?: TranslationGenre;
  chapters?: Chapter[];
  createdAt: string;
  updatedAt: string;
}

export interface ScrapeJobStatus {
  novelId: string;
  totalChapters: number;
  completedChapters: number;
  currentChapterTitle?: string;
  isRunning: boolean;
  isPaused: boolean;
  errors: string[];
}

export interface TranslationJobStatus {
  novelId: string;
  totalChapters: number;
  completedChapters: number;
  currentChapterNumber?: number;
  isRunning: boolean;
  errors: string[];
}
