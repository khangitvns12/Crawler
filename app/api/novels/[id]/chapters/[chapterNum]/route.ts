import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { sanitizeChapter, cleanChapterTitle, cleanChapterContent } from '@/lib/chapter-utils';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Chapter } from '@/types/novel';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; chapterNum: string }> }
) {
  try {
    const { id, chapterNum } = await params;
    const num = parseInt(chapterNum, 10);
    if (isNaN(num)) {
      return NextResponse.json({ error: 'Số chương không hợp lệ' }, { status: 400 });
    }

    const chapter = await serverStorage.getChapterAsync(id, num);
    if (!chapter) {
      return NextResponse.json({ error: `Không tìm thấy chương ${num}` }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: sanitizeChapter(chapter),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT: Edit a chapter and save directly to Supabase
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; chapterNum: string }> }
) {
  try {
    const { id, chapterNum } = await params;
    const num = parseInt(chapterNum, 10);
    if (isNaN(num)) {
      return NextResponse.json({ error: 'Số chương không hợp lệ' }, { status: 400 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Dữ liệu không phải JSON hợp lệ' }, { status: 400 });
    }

    // Retrieve existing chapter first
    let existing = await serverStorage.getChapterAsync(id, num);
    const targetChapterNumber = typeof body.chapterNumber === 'number' && !isNaN(body.chapterNumber)
      ? body.chapterNumber
      : num;

    const rawTitle = body.title !== undefined ? body.title : (existing?.title || `Chương ${targetChapterNumber}`);
    const cleanedTitle = cleanChapterTitle(rawTitle, targetChapterNumber) || `Chương ${targetChapterNumber}`;
    const cleanedTransTitle = body.translatedTitle !== undefined 
      ? (body.translatedTitle ? cleanChapterTitle(body.translatedTitle, targetChapterNumber) : undefined)
      : existing?.translatedTitle;

    const rawContent = body.rawContent !== undefined
      ? cleanChapterContent(body.rawContent)
      : (existing?.rawContent || '');

    const translatedContent = body.translatedContent !== undefined
      ? (body.translatedContent ? cleanChapterContent(body.translatedContent) : undefined)
      : existing?.translatedContent;

    const status = body.translationStatus || (translatedContent ? 'translated' : (existing?.translationStatus || 'pending'));

    const updatedChapter: Chapter = {
      id: existing?.id || `chap-${id}-${targetChapterNumber}`,
      novelId: id,
      chapterNumber: targetChapterNumber,
      title: cleanedTitle,
      translatedTitle: cleanedTransTitle,
      sourceUrl: body.sourceUrl !== undefined ? body.sourceUrl : (existing?.sourceUrl || ''),
      rawContent,
      translatedContent,
      translationStatus: status,
      translationError: body.translationError !== undefined ? body.translationError : existing?.translationError,
      translatedAt: body.translatedAt || (translatedContent ? (existing?.translatedAt || new Date().toISOString()) : undefined),
      wordCount: (translatedContent || rawContent).split(/\s+/).filter(Boolean).length,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    // If chapter number was changed, delete old chapter first
    if (targetChapterNumber !== num) {
      await serverStorage.deleteChapterAsync(id, num);
    }

    const saved = await serverStorage.saveChapterAsync(updatedChapter);

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật và lưu thành công Chương ${targetChapterNumber} vào Supabase!`,
      data: sanitizeChapter(saved),
      supabaseConfigured: isSupabaseConfigured(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE: Delete a chapter from Supabase and server storage
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; chapterNum: string }> }
) {
  try {
    const { id, chapterNum } = await params;
    const num = parseInt(chapterNum, 10);
    if (isNaN(num)) {
      return NextResponse.json({ error: 'Số chương không hợp lệ' }, { status: 400 });
    }

    await serverStorage.deleteChapterAsync(id, num);

    return NextResponse.json({
      success: true,
      message: `Đã xóa thành công Chương ${num} khỏi Supabase và thư viện!`,
      novelId: id,
      chapterNumber: num,
      supabaseConfigured: isSupabaseConfigured(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
