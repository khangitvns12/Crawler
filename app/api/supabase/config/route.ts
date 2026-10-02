import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = isSupabaseConfigured();

  const supabaseUrl = 
    process.env.SUPABASE_URL || 
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    '';

  const supabaseAnonKey = 
    process.env.SUPABASE_ANON_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    '';

  return NextResponse.json({
    configured,
    url: configured ? supabaseUrl : null,
    anonKey: configured ? supabaseAnonKey : null,
  });
}
