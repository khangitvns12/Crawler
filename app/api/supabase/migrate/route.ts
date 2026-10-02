import { NextResponse } from 'next/server';
import { isSupabaseConfigured, saveSupabaseNovel, saveSupabaseChapters } from '@/lib/supabase';
import { serverStorage } from '@/lib/server-storage';

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY trong file .env' },
      { status: 400 }
    );
  }

  try {
    const novels = serverStorage.getAllNovels();
    let migratedNovelsCount = 0;
    let migratedChaptersCount = 0;

    for (const novel of novels) {
      const ok = await saveSupabaseNovel(novel);
      if (ok) migratedNovelsCount++;

      const chapters = serverStorage.getChapters(novel.id);
      if (chapters.length > 0) {
        const chapOk = await saveSupabaseChapters(chapters);
        if (chapOk) migratedChaptersCount += chapters.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã chuyển đổi thành công ${migratedNovelsCount} tiểu thuyết và ${migratedChaptersCount} chương lên Supabase!`,
      data: {
        novelsMigrated: migratedNovelsCount,
        chaptersMigrated: migratedChaptersCount,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Lỗi migrate Supabase: ${msg}` }, { status: 500 });
  }
}
