import JSZip from 'jszip';
import { Novel, Chapter } from '@/types/novel';
import { formatChapterDisplayTitle, cleanChapterContent } from './chapter-utils';

export interface EpubOptions {
  novel: Novel;
  chapters: Chapter[];
  contentType?: 'translated' | 'original' | 'both';
  includeToc?: boolean;
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format plain text into clean XHTML paragraphs
 */
function textToXhtml(text: string): string {
  if (!text) return '<p>Nội dung trống.</p>';
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return `<p>${escapeXml(text)}</p>`;
  }

  return paragraphs
    .map(p => `<p>${escapeXml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

/**
 * Generate a clean SVG cover image if no remote image is available
 */
function generateDefaultSvgCover(title: string, author: string): string {
  const safeTitle = escapeXml(title);
  const safeAuthor = escapeXml(author);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#090d16"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fcd34d"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="url(#bg)"/>
  <rect x="25" y="25" width="550" height="850" fill="none" stroke="url(#gold)" stroke-width="2" opacity="0.6"/>
  <rect x="35" y="35" width="530" height="830" fill="none" stroke="#475569" stroke-width="1" opacity="0.4"/>
  
  <circle cx="300" cy="220" r="80" fill="none" stroke="url(#gold)" stroke-width="1.5" opacity="0.5"/>
  <path d="M 270 220 Q 300 180 330 220 Q 300 260 270 220 Z" fill="none" stroke="url(#gold)" stroke-width="2"/>
  
  <text x="300" y="440" font-family="serif" font-size="36" font-weight="bold" fill="#f8fafc" text-anchor="middle" max-width="500">
    ${safeTitle.length > 28 ? safeTitle.substring(0, 26) + '...' : safeTitle}
  </text>
  
  <line x1="200" y1="480" x2="400" y2="480" stroke="url(#gold)" stroke-width="2"/>
  
  <text x="300" y="540" font-family="sans-serif" font-size="20" fill="#94a3b8" text-anchor="middle">
    Tác giả: ${safeAuthor}
  </text>
  
  <text x="300" y="800" font-family="sans-serif" font-size="14" fill="#64748b" text-anchor="middle" letter-spacing="3">
    NOVELFLOW E-BOOK EDITION
  </text>
</svg>`;
}

/**
 * Generate a complete, standard-compliant EPUB buffer
 */
export async function generateEpub(options: EpubOptions): Promise<Blob> {
  const { novel, chapters, contentType = 'translated', includeToc = true } = options;
  const zip = new JSZip();

  const novelId = novel.id || 'novelflow-' + Date.now();
  const title = novel.title || 'Tiểu thuyết chưa đặt tên';
  const author = novel.author || 'Khuyết danh';
  const description = novel.description || '';
  const now = new Date().toISOString();

  // 1. mimetype (MUST be first file, uncompressed STORE)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.folder('META-INF')?.file('container.xml', containerXml);

  const oebps = zip.folder('OEBPS');
  if (!oebps) throw new Error('Failed to create OEBPS folder in zip');

  // 3. OEBPS/style.css
  const styleCss = `
body {
  font-family: "Georgia", "Merriweather", "Times New Roman", serif;
  font-size: 1.1em;
  line-height: 1.7;
  color: #1a1a1a;
  margin: 1.5em;
  padding: 0;
}
h1, h2, h3 {
  font-family: "Palatino", "Georgia", serif;
  text-align: center;
  font-weight: bold;
  color: #111827;
}
h1.chapter-title {
  margin-top: 1.5em;
  margin-bottom: 1.5em;
  font-size: 1.5em;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.5em;
}
p {
  margin-top: 0;
  margin-bottom: 1em;
  text-indent: 1.5em;
  text-align: justify;
}
.dual-original {
  color: #6b7280;
  font-style: italic;
  font-size: 0.9em;
  border-left: 2px solid #d1d5db;
  padding-left: 0.8em;
  margin-bottom: 0.5em;
}
.dual-translated {
  color: #111827;
  margin-bottom: 1.2em;
}
.cover-container {
  text-align: center;
  margin-top: 2em;
}
.cover-img {
  max-width: 100%;
  height: auto;
}
.metadata-page {
  text-align: center;
  margin-top: 4em;
}
.meta-title {
  font-size: 2em;
  margin-bottom: 0.3em;
}
.meta-author {
  font-size: 1.2em;
  color: #4b5563;
  margin-bottom: 2em;
}
.meta-desc {
  text-align: justify;
  margin: 2em auto;
  max-width: 80%;
  font-size: 0.95em;
  color: #374151;
}
`;
  oebps.file('style.css', styleCss);

  // 4. Handle Cover
  let hasCoverImage = false;
  let coverFilename = 'cover.svg';

  if (novel.coverUrl && novel.coverUrl.startsWith('http')) {
    try {
      const imgRes = await fetch(novel.coverUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (imgRes.ok) {
        const contentTypeHeader = imgRes.headers.get('content-type') || '';
        let ext = 'jpg';
        let mediaType = 'image/jpeg';
        if (contentTypeHeader.includes('png')) {
          ext = 'png';
          mediaType = 'image/png';
        } else if (contentTypeHeader.includes('webp')) {
          ext = 'webp';
          mediaType = 'image/webp';
        }
        const imgBuffer = await imgRes.arrayBuffer();
        coverFilename = `cover.${ext}`;
        oebps.file(coverFilename, imgBuffer);
        hasCoverImage = true;
      }
    } catch {
      // Fallback to SVG cover
    }
  }

  if (!hasCoverImage) {
    const svgCover = generateDefaultSvgCover(title, author);
    oebps.file('cover.svg', svgCover);
    coverFilename = 'cover.svg';
    hasCoverImage = true;
  }

  // Cover XHTML page
  const coverHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Bìa sách - ${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body style="margin:0;padding:0;text-align:center;">
  <div class="cover-container">
    <img src="${coverFilename}" alt="Cover" class="cover-img" style="max-height:98vh;max-width:98vw;object-fit:contain;"/>
  </div>
</body>
</html>`;
  oebps.file('cover.xhtml', coverHtml);

  // Title / Metadata page
  const metaHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="metadata-page">
    <h1 class="meta-title">${escapeXml(title)}</h1>
    <div class="meta-author">Tác giả: ${escapeXml(author)}</div>
    <div style="font-size:0.9em;color:#6b7280;margin-bottom:1.5em;">Tổng số chương: ${chapters.length}</div>
    <hr style="width:50%;margin:1.5em auto;border:none;border-top:1px solid #d1d5db;"/>
    <div class="meta-desc">
      <h3>Giới thiệu:</h3>
      ${textToXhtml(description)}
    </div>
    <div style="margin-top:3em;font-size:0.8em;color:#9ca3af;">
      Được tạo tự động bởi NovelFlow (AI Translation Engine)
    </div>
  </div>
</body>
</html>`;
  oebps.file('info.xhtml', metaHtml);

  // 5. Generate Chapters XHTML - sorted strictly by chapter number
  const sortedChapters = [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
  const validChapters = sortedChapters.length > 0 ? sortedChapters : [
    {
      id: 'chap_sample',
      novelId,
      chapterNumber: 1,
      title: 'Chương 1: Mở đầu',
      sourceUrl: '',
      rawContent: 'Đang cập nhật nội dung chương...',
      translatedContent: 'Đang cập nhật nội dung chương...',
      translationStatus: 'translated',
      wordCount: 10,
      createdAt: now,
    } as Chapter
  ];

  validChapters.forEach((ch, idx) => {
    const chapNum = ch.chapterNumber ?? idx + 1;
    const chapTitle = formatChapterDisplayTitle(
      chapNum,
      ch.title,
      contentType === 'original' ? undefined : ch.translatedTitle
    );
    
    let bodyContent = '';
    const cleanRaw = cleanChapterContent(ch.rawContent || 'Nội dung gốc không có sẵn.');
    const cleanTrans = cleanChapterContent(ch.translatedContent || ch.rawContent || 'Chương này chưa có nội dung.');

    if (contentType === 'original') {
      bodyContent = textToXhtml(cleanRaw);
    } else if (contentType === 'both') {
      // Dual-language view
      const rawParas = cleanRaw.split(/\n\s*\n/).filter(Boolean);
      const transParas = cleanTrans.split(/\n\s*\n/).filter(Boolean);
      const maxLen = Math.max(rawParas.length, transParas.length);
      const combinedHtml: string[] = [];
      for (let p = 0; p < maxLen; p++) {
        if (rawParas[p]) {
          combinedHtml.push(`<div class="dual-original">${escapeXml(rawParas[p])}</div>`);
        }
        if (transParas[p]) {
          combinedHtml.push(`<div class="dual-translated"><p>${escapeXml(transParas[p])}</p></div>`);
        }
      }
      bodyContent = combinedHtml.join('\n');
    } else {
      // Translated only (default)
      bodyContent = textToXhtml(cleanTrans);
    }

    const chapHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXml(chapTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1 class="chapter-title">${escapeXml(chapTitle)}</h1>
  <div class="chapter-body">
    ${bodyContent}
  </div>
</body>
</html>`;
    oebps.file(`chapter_${chapNum}.xhtml`, chapHtml);
  });

  // 6. Navigation Document (nav.xhtml - EPUB 3 requirement)
  const navHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Mục lục - ${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Mục lục</h1>
    <ol>
      <li><a href="info.xhtml">Thông tin tác phẩm</a></li>
      ${validChapters.map((ch, idx) => {
        const chapTitle = formatChapterDisplayTitle(
          idx + 1,
          ch.title,
          contentType === 'original' ? undefined : ch.translatedTitle
        );
        return `<li><a href="chapter_${idx + 1}.xhtml">${escapeXml(chapTitle)}</a></li>`;
      }).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
  oebps.file('nav.xhtml', navHtml);

  // 7. NCX (toc.ncx - EPUB 2 backward compatibility for Kindle / e-ink readers)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${novelId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <docAuthor>
    <text>${escapeXml(author)}</text>
  </docAuthor>
  <navMap>
    <navPoint id="navPoint-info" playOrder="1">
      <navLabel><text>Thông tin tác phẩm</text></navLabel>
      <content src="info.xhtml"/>
    </navPoint>
    ${validChapters.map((ch, idx) => {
      const chapTitle = formatChapterDisplayTitle(
        idx + 1,
        ch.title,
        contentType === 'original' ? undefined : ch.translatedTitle
      );
      return `<navPoint id="navPoint-${idx + 2}" playOrder="${idx + 2}">
      <navLabel><text>${escapeXml(chapTitle)}</text></navLabel>
      <content src="chapter_${idx + 1}.xhtml"/>
    </navPoint>`;
    }).join('\n    ')}
  </navMap>
</ncx>`;
  oebps.file('toc.ncx', tocNcx);

  // 8. OEBPS/content.opf
  const coverMediaType = coverFilename.endsWith('.png') ? 'image/png' : coverFilename.endsWith('.webp') ? 'image/webp' : coverFilename.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:${novelId}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>vi</dc:language>
    <dc:description>${escapeXml(description)}</dc:description>
    <dc:publisher>NovelFlow</dc:publisher>
    <meta property="dcterms:modified">${now}</meta>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="cover-image" href="${coverFilename}" media-type="${coverMediaType}" properties="cover-image"/>
    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="info-page" href="info.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${validChapters.map((_, idx) => `<item id="chap_${idx + 1}" href="chapter_${idx + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover-page"/>
    <itemref idref="info-page"/>
    ${includeToc ? '<itemref idref="nav"/>' : ''}
    ${validChapters.map((_, idx) => `<itemref idref="chap_${idx + 1}"/>`).join('\n    ')}
  </spine>
</package>`;
  oebps.file('content.opf', contentOpf);

  // Generate EPUB Blob
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  return blob;
}
