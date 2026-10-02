import { Novel } from '@/types/novel';

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
 * Generate OPDS 1.2 Catalog XML feed for e-readers (Moon+ Reader, FBReader, Aldiko, etc.)
 */
export function generateOpdsFeed(novels: Novel[], baseUrl: string): string {
  const now = new Date().toISOString();

  const entries = novels.map(novel => {
    const epubUrl = `${baseUrl}/api/v1/novels/${novel.id}/epub`;
    const coverUrl = novel.coverUrl || `${baseUrl}/api/placeholder-cover?id=${novel.id}`;

    return `  <entry>
    <title>${escapeXml(novel.title)}</title>
    <id>urn:novelflow:novel:${novel.id}</id>
    <updated>${novel.updatedAt || now}</updated>
    <author>
      <name>${escapeXml(novel.author)}</name>
    </author>
    <summary>${escapeXml(novel.description || 'Không có mô tả')}</summary>
    <link rel="http://opds-spec.org/image" href="${coverUrl}" type="image/jpeg" />
    <link rel="http://opds-spec.org/image/thumbnail" href="${coverUrl}" type="image/jpeg" />
    <link rel="http://opds-spec.org/acquisition" href="${epubUrl}" type="application/epub+zip" title="Tải EPUB Offline" />
  </entry>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:novelflow:catalog:root</id>
  <title>NovelFlow OPDS Catalog (Thư viện truyện)</title>
  <subtitle>Danh sách tiểu thuyết đã tải xuống và dịch AI</subtitle>
  <updated>${now}</updated>
  <author>
    <name>NovelFlow Engine</name>
    <uri>${baseUrl}</uri>
  </author>
  <link rel="self" href="${baseUrl}/api/v1/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation" />
  <link rel="start" href="${baseUrl}/api/v1/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation" />
${entries}
</feed>`;
}
