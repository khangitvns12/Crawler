import { Chapter } from '@/types/novel';

/**
 * Normalizes and deduplicates repeated chapter prefixes in titles such as:
 * - "Chương 1: Chương 1:" => "Chương 1"
 * - "Chương 1: Chương 1: Khởi đầu" => "Chương 1: Khởi đầu"
 * - "Chương 1 - Chương 1: Tiết tử" => "Chương 1: Tiết tử"
 * - "Chương 1: Chương 1" => "Chương 1"
 * - "Chương 01: Chương 1:" => "Chương 1"
 * - "Chap 1: Chap 1: Gặp gỡ" => "Chương 1: Gặp gỡ"
 * - "Chapter 1: Chapter 1:" => "Chương 1"
 * - "[Chương 1] Chương 1: Tuyệt Cảnh" => "Chương 1: Tuyệt Cảnh"
 * - "Chương 1: [Chương 1] Tuyệt Cảnh" => "Chương 1: Tuyệt Cảnh"
 * - "第1章 第1章 绝境逢生" => "第1章: 绝境逢生"
 * - "Chương 1: : Mở đầu" => "Chương 1: Mở đầu"
 * - "Chương 1:" => "Chương 1"
 */
export function cleanChapterTitle(rawTitle?: string | null, fallbackNumber?: number): string {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return fallbackNumber != null ? `Chương ${fallbackNumber}` : '';
  }

  // 1. Remove zero-width spaces, BOM, NBSP, and leading/trailing whitespace
  let title = rawTitle.replace(/^[\u200B\uFEFF\u00A0\s]+|[\u200B\uFEFF\u00A0\s]+$/g, '');

  // 2. Remove leading decorative noise (bullets, arrows, badges)
  title = title.replace(/^[\s•\-\>✓★☆#|~_]+/g, '').trim();

  // 3. Match repeated Vietnamese, English, or pinyin chapter prefixes
  // e.g. "Chương 1: Chương 1:", "Chương 1 - Chương 1: Tiêu đề", "Chap 1: Chap 1:"
  const vnRepeatedPattern = /^(?:\[?\s*(?:chương|chuong|chap|chapter|hồi|hoi|tập|tap)\s*0*(\d+)\s*\]?[\s\:\：\.\-–—]*)+/i;
  const matchVn = title.match(vnRepeatedPattern);

  if (matchVn) {
    const chapNum = matchVn[1] || (fallbackNumber != null ? String(fallbackNumber) : '');
    let rest = title.slice(matchVn[0].length).trim();

    // Check if rest contains any second duplicate prefix (e.g. mixed [Chương 1] or Chap 1)
    const secondaryMatch = rest.match(/^(?:\[?\s*(?:chương|chuong|chap|chapter|hồi|hoi|tập|tap)\s*0*\d*\s*\]?[\s\:\：\.\-–—]*)+/i);
    if (secondaryMatch) {
      rest = rest.slice(secondaryMatch[0].length).trim();
    }

    // Clean leading punctuation in remaining subtitle (e.g. ": ", "- ", ": :")
    rest = rest.replace(/^[\s\:\：\.\-–—\[\]\(\)]+/, '').trim();
    // Clean trailing punctuation
    rest = rest.replace(/[\s\:\：\.\-–—]+$/, '').trim();

    // Deduplicate if subtitle itself was repeated (e.g., "Mở đầu: Mở đầu" or "Tiết tử: Tiết tử")
    if (rest) {
      const subParts = rest.split(/[\:\：\-–—]+/);
      if (subParts.length === 2 && subParts[0].trim().toLowerCase() === subParts[1].trim().toLowerCase()) {
        rest = subParts[0].trim();
      }
    }

    return rest ? `Chương ${chapNum}: ${rest}` : `Chương ${chapNum}`;
  }

  // 4. Match repeated Chinese / Japanese chapter prefixes: 第1章 第1章 / 第1話 第1話
  const cjPattern = /^(?:第\s*0*(\d+)\s*([章話话回節节])[\s\:\：\.\-–—]*)+/i;
  const cjMatch = title.match(cjPattern);
  if (cjMatch) {
    const chapNum = cjMatch[1] || (fallbackNumber != null ? String(fallbackNumber) : '');
    const unit = cjMatch[2] || '章';
    let rest = title.slice(cjMatch[0].length).trim();
    rest = rest.replace(/^[\s\:\：\.\-–—\[\]\(\)]+/, '').trim();
    rest = rest.replace(/[\s\:\：\.\-–—]+$/, '').trim();
    return rest ? `第${chapNum}${unit}: ${rest}` : `第${chapNum}${unit}`;
  }

  // 5. Clean dangling trailing punctuation like "Chương 1:" or "Tiết tử -"
  title = title.replace(/[\s\:\：\.\-–—]+$/, '').trim();

  return title;
}

/**
 * Format chapter title for display in UI, ensuring NO duplicate "Chương X: Chương X: ..."
 * Works with both original and translated titles.
 *
 * Examples:
 * - formatChapterDisplayTitle(1, "Chương 1: Chương 1:") => "Chương 1"
 * - formatChapterDisplayTitle(1, "Chương 1: Khởi đầu") => "Chương 1: Khởi đầu" (NOT "Chương 1: Chương 1: Khởi đầu")
 * - formatChapterDisplayTitle(1, "Khởi đầu") => "Chương 1: Khởi đầu"
 * - formatChapterDisplayTitle(1, "1: Khởi đầu") => "Chương 1: Khởi đầu"
 * - formatChapterDisplayTitle(1, "Chương 1") => "Chương 1"
 * - formatChapterDisplayTitle(1, "") => "Chương 1"
 */
export function formatChapterDisplayTitle(
  chapterNumber: number,
  title?: string | null,
  translatedTitle?: string | null
): string {
  // Prefer translated title if available, otherwise original title
  const chosenRaw = (translatedTitle && translatedTitle.trim()) ? translatedTitle : (title || '');
  const cleaned = cleanChapterTitle(chosenRaw, chapterNumber);

  if (!cleaned) {
    return `Chương ${chapterNumber}`;
  }

  // Check if it already starts with a canonical prefix ("Chương 1", "Chapter 1", "Chap 1", "第1章")
  const hasChapterPrefix = /^(?:\[?\s*(?:chương|chuong|chap|chapter|hồi|hoi|tập|tap)\s*0*\d+|第\s*0*\d+\s*[章話话回節节])/i.test(cleaned);
  if (hasChapterPrefix) {
    return cleaned;
  }

  // Check if it starts with number and punctuation like "1: Khởi đầu" or "1. Khởi đầu"
  const startsWithNum = cleaned.match(/^0*(\d+)[\s\:\：\.\-–—]+(.*)$/);
  if (startsWithNum) {
    const num = startsWithNum[1];
    const rest = startsWithNum[2].trim();
    return rest ? `Chương ${num}: ${rest}` : `Chương ${num}`;
  }

  // Otherwise, prefix with Chapter Number
  return `Chương ${chapterNumber}: ${cleaned}`;
}

/**
 * Strips watermarks, website source attributions, promotional signatures, and URLs
 * commonly found at the bottom (and body) of scraped web novel chapters.
 *
 * Examples of removed attributions:
 * - "Nguồn: truyenfull.vn"
 * - "Nguồn: Tàng Thư Viện"
 * - "Đọc truyện online tại TruyenFull..."
 * - "Bạn đang đọc truyện tại Metruyenchu..."
 * - "Truyện được chia sẻ tại truyenyy.vip"
 * - "Ủng hộ nhóm dịch tại..."
 * - "Theo dõi fanpage của chúng tôi..."
 * - "Chúc các bạn đọc truyện vui vẻ!"
 * - "请记住本书首发域名：..."
 * - "69书吧 www.69shuba.com"
 * - "本章未完，点击下一页继续阅读"
 * - "https://truyenfull.vn/..."
 */
export function stripSourceWatermarks(content?: string | null): string {
  if (!content || typeof content !== 'string') return '';

  let text = content;

  // 1. Remove BOM, zero-width characters
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 2. Split into lines to inspect from bottom-up and filter watermarks
  const lines = text.split('\n');

  // Regex patterns that identify website attribution, promotional watermarks, or site credits
  const watermarkLinePatterns = [
    // Vietnamese source and credit watermarks
    /^\s*(?:nguồn|nguon)\s*[:：\-–—\.]\s*.+$/i,
    /^\s*(?:nguồn truyện|nguồn bản dịch|nguồn convert|nguồn st|nguồn sưu tầm|bản quyền)\s*[:：\-–—\.]\s*.+$/i,
    /^\s*(?:đọc truyện|đọc bản dịch|xem truyện|xem bản dịch)\s+(?:tại|online|nhanh nhất|miễn phí|sớm nhất).+$/i,
    /^\s*(?:bạn đang đọc|bạn đang xem)\s+.*(?:tại|online|ở|được dịch|được copy|được chia sẻ).+$/i,
    /^\s*truyện\s+(?:được|chỉ)\s+(?:đăng tải|dịch|edit|chia sẻ|sưu tầm|copy|phát hành)\s+(?:tại|bởi|trên).+$/i,
    /^\s*(?:ủng hộ|donate|mời cà phê)\s+(?:cho\s+)?(?:tác giả|converter|nhóm dịch|dịch giả).+$/i,
    /^\s*(?:theo dõi|tham gia)\s+(?:fanpage|kênh|group|nhóm|chúng tôi|server|discord).+$/i,
    /^\s*chúc\s+(?:bạn|các bạn|quý độc giả)\s+(?:đọc truyện vui vẻ|có những giây phút).+$/i,
    /^\s*(?:mời các bạn|hãy|vui lòng)\s+đón đọc\s+chương tiếp theo.+$/i,
    /^\s*(?:đừng quên|hãy)\s+(?:bình luận|vote|đánh giá|thả hoa|thả sao|tặng sao|tặng quà).+$/i,
    /^\s*(?:xem thêm tại|truy cập website|ghé thăm)\s*[:：\-–—\.]?\s*.+$/i,
    
    // Popular site domain names standalone (e.g. "truyenfull.vn", "metruyenchu.com", "tangthuvien.vn")
    /^\s*(?:truyện full|truyenfull|metruyenchu|tangthuvien|truyenchu|nettruyen|sstruyen|truyenyy|wikidich|truyenhdt|dtruyen|vipvandan|bachngocsach|gacsach|santruyen|webtruyen)\s*(?:\.(?:vn|com|net|org|vip|info|cc|top|me))?\s*[\.\:\-–—]*$/i,
    
    // Chinese source and promotional watermarks
    /^\s*(?:请记住本书首发域名|一秒记住|手机版阅读网址|手机用户请访问|本书首发域名|最新域名|最新章节尽在).*$/i,
    /^\s*(?:69书吧|笔趣阁|顶点小说|飘天文学|八零电子书|纵横中文网|起点中文网|飞卢小说网)\s*(?:www\.[a-z0-9\.\-]+)?.*$/i,
    /^\s*(?:来源|出处|转载自|首发于)\s*[:：].*$/i,
    /^\s*(?:求推荐票|求月票|求打赏|求订阅|求鲜花|求收藏|求自订).*$/i,
    /^\s*(?:本章未完|点击下一页继续阅读).*$/i,
    /^\s*（?本章完）?\s*$/i,
    /^\s*loadAdv\s*\(\s*\d+\s*,\s*\d+\s*\)\s*;?\s*$/i,
    /^\s*(?:\d{4}[-/]\d{2}[-/]\d{2}\s+)?作者\s*[:：]\s*.+$/i,
    /^\s*小说关键词\s*[:：].*$/i,
    
    // Japanese watermarks
    /^\s*(?:※この作品は|転載禁止|小説家になろう|カクヨム).*$/i,
    /^\s*(?:ブックマークや評価|感想や評価|応援コメント).*$/i,
    
    // English watermarks
    /^\s*(?:source|originally published at|read on|support the author|support the translator)\s*[:：\-–—\.]\s*.+$/i,
    /^\s*(?:you are reading this novel on|find more chapters on|read at the original website).+$/i,
    
    // Standalone URLs, links or domain patterns
    /^\s*(?:https?:\/\/[^\s]+|www\.[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+(?:\/[^\s]*)?)\s*$/i,
    /^\s*[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.(?:com|vn|net|org|co|cc|cx|top|vip|me|info|xyz|app|io)(?:\/[^\s]*)?\s*$/i,
  ];

  // Filter out any lines matching watermark patterns
  const filteredLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      filteredLines.push('');
      continue;
    }

    const isWatermark = watermarkLinePatterns.some(pattern => pattern.test(trimmed));
    if (!isWatermark) {
      filteredLines.push(line);
    }
  }

  // Trim trailing empty lines, separator lines ("---", "***", "===") and signature lines from bottom
  while (filteredLines.length > 0) {
    const lastLine = filteredLines[filteredLines.length - 1].trim();
    if (
      !lastLine ||
      /^[-–—_*\=~#\.\s]{3,}$/.test(lastLine) ||
      watermarkLinePatterns.some(pattern => pattern.test(lastLine))
    ) {
      filteredLines.pop();
    } else {
      break;
    }
  }

  // Also trim leading empty lines
  while (filteredLines.length > 0 && !filteredLines[0].trim()) {
    filteredLines.shift();
  }

  return filteredLines.join('\n');
}

/**
 * Clean chapter content: strips watermarks, normalizes line breaks and paragraph spacing
 */
export function cleanChapterContent(content?: string | null): string {
  if (!content) return '';
  const stripped = stripSourceWatermarks(content);
  
  // Normalize paragraphs (collapse 3+ consecutive newlines into 2)
  return stripped.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Sorts chapters strictly by chapterNumber ascending
 */
export function sortChapters(chapters: Chapter[]): Chapter[] {
  if (!Array.isArray(chapters)) return [];
  return [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
}

/**
 * Sanitize a single Chapter object, removing duplicate titles in both title and translatedTitle
 * and stripping any source attribution or watermark from rawContent and translatedContent
 */
export function sanitizeChapter(chapter: Chapter): Chapter {
  const cleanedTitle = cleanChapterTitle(chapter.title, chapter.chapterNumber) || `Chương ${chapter.chapterNumber}`;
  const cleanedTranslated = chapter.translatedTitle
    ? cleanChapterTitle(chapter.translatedTitle, chapter.chapterNumber)
    : undefined;

  const cleanedRawContent = chapter.rawContent ? cleanChapterContent(chapter.rawContent) : '';
  const cleanedTranslatedContent = chapter.translatedContent ? cleanChapterContent(chapter.translatedContent) : undefined;

  return {
    ...chapter,
    title: cleanedTitle,
    translatedTitle: cleanedTranslated,
    rawContent: cleanedRawContent,
    translatedContent: cleanedTranslatedContent,
    wordCount: chapter.wordCount || (cleanedTranslatedContent || cleanedRawContent).split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Sanitize an array of chapters and sort them strictly by chapterNumber ascending
 */
export function sanitizeChapters(chapters: Chapter[]): Chapter[] {
  if (!Array.isArray(chapters)) return [];
  const sanitized = chapters.map(sanitizeChapter);
  return sortChapters(sanitized);
}

/**
 * Parses Chinese numerals (e.g. "一千二百三十四" -> 1234, "五百六十八" -> 568)
 */
export function parseChineseNumber(str: string): number {
  if (!str) return 0;
  if (/^\d+$/.test(str)) return parseInt(str, 10);

  const digitMap: Record<string, number> = {
    '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  };

  let total = 0;
  let section = 0;
  let currentDigit = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (digitMap[char] !== undefined) {
      currentDigit = digitMap[char];
      if (i === str.length - 1) {
        section += currentDigit;
      }
    } else if (char === '十') {
      section += (currentDigit === 0 ? 1 : currentDigit) * 10;
      currentDigit = 0;
    } else if (char === '百') {
      section += (currentDigit === 0 ? 1 : currentDigit) * 100;
      currentDigit = 0;
    } else if (char === '千') {
      section += (currentDigit === 0 ? 1 : currentDigit) * 1000;
      currentDigit = 0;
    } else if (char === '万') {
      section += currentDigit;
      total += section * 10000;
      section = 0;
      currentDigit = 0;
    } else if (char === '亿') {
      section += currentDigit;
      total += section * 100000000;
      section = 0;
      currentDigit = 0;
    }
  }

  total += section;
  return total;
}

/**
 * Extracts numeric chapter number from a chapter title (Vietnamese, Chinese, English, or raw number)
 * e.g. "第568章 566：任意门" -> 568
 * e.g. "Chương 45: Đại Đạo" -> 45
 * e.g. "Chapter 123" -> 123
 * e.g. "第一千二百三十四章" -> 1234
 */
export function parseChapterNumber(title: string): number | null {
  if (!title || typeof title !== 'string') return null;

  // 1. Chinese style with Arabic digits: 第568章, 第 568 回, 第568节
  const zhArabic = title.match(/第\s*(\d+)\s*[章話话回節节]/);
  if (zhArabic) {
    const num = parseInt(zhArabic[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // 2. Vietnamese / English style: Chương 123, Chapter 123, Chap 123, Hồi 123
  const vnMatch = title.match(/(?:chương|chuong|chap|chapter|hồi|hoi|tập|tap)\s*0*(\d+)/i);
  if (vnMatch) {
    const num = parseInt(vnMatch[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // 3. Chinese numerals: 第一千二百三十四章, 第五百六十八回
  const zhNumMatch = title.match(/第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*[章話话回節节]/);
  if (zhNumMatch) {
    const parsed = parseChineseNumber(zhNumMatch[1]);
    if (parsed > 0) return parsed;
  }

  // 4. Starting with number: "568: 任意门" or "568. Khởi đầu" or "568 - "
  const startNum = title.match(/^0*(\d+)[\s:：\.\-–—]/);
  if (startNum) {
    const num = parseInt(startNum[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // 5. Fallback: any standalone number in the title
  const anyNum = title.match(/\b(\d+)\b/);
  if (anyNum) {
    const num = parseInt(anyNum[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }

  return null;
}
