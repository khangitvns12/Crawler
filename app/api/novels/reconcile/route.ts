import { NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';

export async function POST() {
  try {
    const result = await serverStorage.reconcileDuplicateNovels();
    const allNovels = await serverStorage.getAllNovelsAsync();
    return NextResponse.json({
      success: true,
      mergedCount: result.mergedCount,
      novels: allNovels,
      message:
        result.mergedCount > 0
          ? `Đã phát hiện và gộp thành công ${result.mergedCount} bộ truyện trùng lặp vào bộ truyện gốc.`
          : 'Không phát hiện bộ truyện nào bị trùng lặp trong thư viện.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
