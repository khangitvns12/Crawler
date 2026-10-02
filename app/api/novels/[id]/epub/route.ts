import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { generateEpub } from '@/lib/epub-generator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const novel = serverStorage.getNovelById(id);
    if (!novel) {
      return NextResponse.json({ error: 'Không tìm thấy truyện' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const contentType = (searchParams.get('type') || 'translated') as 'translated' | 'original' | 'both';
    const includeToc = searchParams.get('toc') !== 'false';

    const chapters = serverStorage.getChapters(id);
    const epubBlob = await generateEpub({
      novel,
      chapters,
      contentType,
      includeToc,
    });

    const arrayBuffer = await epubBlob.arrayBuffer();
    const safeTitle = (novel.title || 'novel')
      .replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(safeTitle)}.epub"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
