import { NextRequest, NextResponse } from 'next/server';
import {
  fetchSupabaseApiKeys,
  saveSupabaseApiKeys,
  deleteSupabaseApiKey,
  isSupabaseConfigured,
} from '@/lib/supabase';
import { GeminiApiKey } from '@/types/novel';

/**
 * GET /api/keys
 * Retrieve all Gemini API keys from Supabase
 */
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        success: true,
        data: [],
        supabaseConfigured: false,
        message: 'Supabase chưa được cấu hình. Đang dùng LocalStorage.',
      });
    }

    const keys = await fetchSupabaseApiKeys();
    return NextResponse.json({
      success: true,
      data: keys,
      supabaseConfigured: true,
      count: keys.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/keys
 * Save or update one or multiple Gemini API keys in Supabase
 */
export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Dữ liệu không phải JSON hợp lệ' },
        { status: 400 }
      );
    }

    let targetKeys: GeminiApiKey[] = [];
    if (Array.isArray(body)) {
      targetKeys = body;
    } else if (Array.isArray(body?.keys)) {
      targetKeys = body.keys;
    } else if (body?.key && typeof body.key === 'object') {
      targetKeys = [body.key];
    } else if (body?.key && typeof body.key === 'string') {
      targetKeys = [
        {
          id: body.id || 'key_' + Math.random().toString(36).substring(2, 11),
          key: body.key.trim(),
          label: body.label || 'API Key',
          isActive: body.isActive !== undefined ? body.isActive : true,
          status: body.status || 'untested',
          lastTestedAt: body.lastTestedAt,
          errorMessage: body.errorMessage,
        },
      ];
    }

    if (targetKeys.length === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy thông tin API Key cần lưu' },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        success: true,
        savedToSupabase: false,
        message: 'Supabase chưa cấu hình biến môi trường, key được giữ ở LocalStorage.',
        data: targetKeys,
      });
    }

    const ok = await saveSupabaseApiKeys(targetKeys);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Không thể lưu API Key vào Supabase' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      savedToSupabase: true,
      message: `Đã lưu thành công ${targetKeys.length} API Key vào cơ sở dữ liệu Supabase!`,
      data: targetKeys,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/keys
 * Delete an API key by id from Supabase
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch {
        // ignore
      }
    }

    if (!id) {
      return NextResponse.json(
        { error: 'Thiếu ID của API Key cần xóa' },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        success: true,
        deletedFromSupabase: false,
        message: 'Đã xóa cục bộ (Supabase chưa cấu hình).',
      });
    }

    const ok = await deleteSupabaseApiKey(id);
    return NextResponse.json({
      success: ok,
      deletedFromSupabase: ok,
      message: ok
        ? 'Đã xóa API Key thành công khỏi Supabase!'
        : 'Không thể xóa API Key khỏi Supabase.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
