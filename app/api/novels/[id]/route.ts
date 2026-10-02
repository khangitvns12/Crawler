import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { Novel } from '@/types/novel';

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
    return NextResponse.json({ success: true, data: novel });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = serverStorage.getNovelById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy truyện' }, { status: 404 });
    }

    const updated = serverStorage.saveNovel({
      ...existing,
      ...body,
      id, // keep id fixed
      updatedAt: new Date().toISOString(),
    } as Novel);

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = serverStorage.deleteNovel(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Không tìm thấy truyện để xóa' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Đã xóa truyện khỏi thư viện' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
