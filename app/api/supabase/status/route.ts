import { NextResponse } from 'next/server';
import { isSupabaseConfigured, validateSupabaseConnection, getSupabaseClient } from '@/lib/supabase';
import { serverStorage } from '@/lib/server-storage';

export async function GET() {
  const configured = isSupabaseConfigured();

  if (!configured) {
    return NextResponse.json({
      configured: false,
      ok: false,
      message: 'Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY trong file .env',
      provider: 'supabase',
    });
  }

  const validation = await validateSupabaseConnection();
  let stats = {
    localNovelsCount: serverStorage.getAllNovels().length,
    remoteNovelsCount: 0,
    remoteChaptersCount: 0,
  };

  if (validation.ok) {
    const client = getSupabaseClient();
    if (client) {
      try {
        const { count: nCt } = await client.from('novels').select('*', { count: 'exact', head: true });
        const { count: cCt } = await client.from('chapters').select('*', { count: 'exact', head: true });
        stats.remoteNovelsCount = nCt ?? 0;
        stats.remoteChaptersCount = cCt ?? 0;
      } catch {
        // ignore
      }
    }
  }

  return NextResponse.json({
    configured: true,
    ok: validation.ok,
    tableMissing: validation.tableMissing || false,
    message: validation.message,
    provider: 'supabase',
    stats,
  });
}
