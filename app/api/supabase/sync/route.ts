import { NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { isSupabaseConfigured } from '@/lib/supabase';

export async function GET() {
  return handleSync();
}

export async function POST() {
  return handleSync();
}

async function handleSync() {
  try {
    const configured = isSupabaseConfigured();
    if (!configured) {
      const novels = serverStorage.getAllNovels();
      return NextResponse.json({
        success: false,
        configured: false,
        message: 'Chưa cấu hình Supabase (SUPABASE_URL hoặc SUPABASE_ANON_KEY)',
        data: novels,
      });
    }

    const result = await serverStorage.syncWithSupabase();
    const novels = serverStorage.getAllNovels();

    return NextResponse.json({
      success: result.success,
      configured: true,
      message: result.message,
      syncedNovelsCount: result.syncedNovelsCount,
      syncedChaptersCount: result.syncedChaptersCount,
      data: novels,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      configured: isSupabaseConfigured(),
      message: `Lỗi đồng bộ Supabase: ${msg}`,
      data: serverStorage.getAllNovels(),
    }, { status: 500 });
  }
}
