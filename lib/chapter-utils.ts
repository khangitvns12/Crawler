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
 * Sanitize a single Chapter object, removing duplicate titles in both title and translatedTitle
 */
export function sanitizeChapter(chapter: Chapter): Chapter {
  const cleanedTitle = cleanChapterTitle(chapter.title, chapter.chapterNumber) || `Chương ${chapter.chapterNumber}`;
  const cleanedTranslated = chapter.translatedTitle
    ? cleanChapterTitle(chapter.translatedTitle, chapter.chapterNumber)
    : undefined;

  return {
    ...chapter,
    title: cleanedTitle,
    translatedTitle: cleanedTranslated,
  };
}

/**
 * Sanitize an array of chapters
 */
export function sanitizeChapters(chapters: Chapter[]): Chapter[] {
  if (!Array.isArray(chapters)) return [];
  return chapters.map(sanitizeChapter);
}
