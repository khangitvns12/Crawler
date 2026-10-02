#!/usr/bin/env node

/**
 * ====================================================================
 * SUPABASE MANAGEMENT CLI FOR STORY SCRAPER & AI TRANSLATION HUB
 * ====================================================================
 * Sử dụng:
 *   npx tsx scripts/supabase-cli.ts <command>
 *   hoặc: npm run supabase:cli -- <command>
 *
 * Các lệnh hỗ trợ:
 *   test        - Kiểm tra kết nối tới Supabase & kiểm tra các bảng
 *   schema      - In ra mã SQL Schema hoặc hướng dẫn tạo bảng
 *   migrate     - Di chuyển (migrate) toàn bộ truyện & chương từ Local DB lên Supabase
 *   status      - Xem thống kê số lượng tiểu thuyết & chương trong Supabase
 *   list        - Liệt kê danh sách tiểu thuyết hiện có trong Supabase
 *   help        - Hướng dẫn chi tiết cách thiết lập & sử dụng
 * ====================================================================
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Tự động nạp biến môi trường từ .env hoặc .env.local
function loadEnv() {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    }
  }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function getClient() {
  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project') || supabaseKey.includes('your-anon-key')) {
    console.error('\n❌ [LỖI CẤU HÌNH]: Chưa thiết lập SUPABASE_URL và SUPABASE_ANON_KEY trong file .env');
    console.log('👉 Hãy tạo file .env trong thư mục gốc và thêm:');
    console.log('   SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co"');
    console.log('   SUPABASE_ANON_KEY="eyJhbGciOi..."\n');
    process.exit(1);
  }
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}

function isTableNotFound(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('relation') ||
    msg.includes('does not exist')
  );
}

// -------------------------------------------------------------
// LỆNH 1: TEST KẾT NỐI
// -------------------------------------------------------------
async function cmdTest() {
  console.log('\n🔍 Đang kiểm tra kết nối Supabase...');
  console.log(`📡 URL: ${supabaseUrl}`);
  console.log(`🔑 Key: ${supabaseKey.substring(0, 12)}...${supabaseKey.slice(-6)}`);

  const client = getClient();

  try {
    const start = Date.now();
    const { data, error } = await client.from('novels').select('id, title').limit(1);
    const latency = Date.now() - start;

    if (error) {
      if (isTableNotFound(error)) {
        console.log(`\n✅ Kết nối tới máy chủ Supabase thành công (${latency}ms)!`);
        console.log('⚠️  Tuy nhiên bảng "novels" CHƯA ĐƯỢC TẠO trong database.');
        console.log('👉 Hãy chạy mã SQL schema trong Supabase SQL Editor:');
        console.log('   1. Mở https://supabase.com -> chọn project của bạn');
        console.log('   2. Chọn mục "SQL Editor" ở menu trái -> New Query');
        console.log('   3. Dán toàn bộ mã từ lệnh sau và bấm "RUN":');
        console.log('      npx tsx scripts/supabase-cli.ts schema\n');
        return;
      }
      console.error(`\n❌ Lỗi phản hồi từ Supabase (${latency}ms):`, error.message);
      return;
    }

    console.log(`\n✅ KẾT NỐI SUPABASE HOÀN TOÀN THÀNH CÔNG! (${latency}ms)`);
    console.log('✓ Bảng `novels`: Sẵn sàng');
    
    // Kiểm tra bảng chapters
    const chRes = await client.from('chapters').select('id').limit(1);
    if (chRes.error) {
      console.log('⚠️ Bảng `chapters` chưa tồn tại hoặc bị lỗi:', chRes.error.message);
    } else {
      console.log('✓ Bảng `chapters`: Sẵn sàng');
    }
    console.log('');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\n❌ Không thể kết nối tới máy chủ Supabase:', msg);
  }
}

// -------------------------------------------------------------
// LỆNH 2: SCHEMA
// -------------------------------------------------------------
function cmdSchema() {
  const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
  console.log('\n======================================================');
  console.log('📄 SUPABASE POSTGRESQL SCHEMA (supabase/schema.sql)');
  console.log('======================================================\n');
  if (fs.existsSync(schemaPath)) {
    console.log(fs.readFileSync(schemaPath, 'utf-8'));
  } else {
    console.log('Không tìm thấy file supabase/schema.sql');
  }
  console.log('======================================================');
  console.log('👉 Hướng dẫn thực thi:');
  console.log('1. Mở Supabase Dashboard (https://app.supabase.com)');
  console.log('2. Chọn Project của bạn -> vào mục "SQL Editor" (ở menu bên trái)');
  console.log('3. Nhấp "New Query", dán toàn bộ đoạn mã SQL trên và bấm "RUN"');
  console.log('======================================================\n');
}

// -------------------------------------------------------------
// LỆNH 3: MIGRATE DỮ LIỆU TỪ LOCAL LÊN SUPABASE
// -------------------------------------------------------------
async function cmdMigrate() {
  console.log('\n🚀 BẮT ĐẦU MIGRATE DỮ LIỆU LÊN SUPABASE...\n');
  const dbFile = path.join(process.cwd(), '.data', 'novels-db.json');
  if (!fs.existsSync(dbFile)) {
    console.log('ℹ️ Không tìm thấy file dữ liệu local (.data/novels-db.json). Không có truyện nào để chuyển.');
    return;
  }

  const rawData = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
  const novelsMap = rawData.novels || {};
  const chaptersMap = rawData.chapters || {};
  const novelsList = Object.values(novelsMap);

  console.log(`📦 Tìm thấy ${novelsList.length} bộ truyện trong bộ nhớ local.`);
  if (novelsList.length === 0) return;

  const client = getClient();

  // 1. Upload novels
  console.log('\n1. Đang tải lên danh sách Novels...');
  let novelSuccess = 0;
  for (const novel of novelsList as any[]) {
    const payload = {
      id: novel.id,
      title: novel.title,
      original_title: novel.originalTitle || '',
      author: novel.author || 'Khuyết danh',
      description: novel.description || '',
      cover_url: novel.coverUrl || '',
      source_url: novel.sourceUrl || '',
      source_domain: novel.sourceDomain || '',
      original_language: novel.originalLanguage || 'zh',
      target_language: novel.targetLanguage || 'vi',
      status: novel.status || 'ongoing',
      chapters_count: novel.chaptersCount || 0,
      translated_chapters_count: novel.translatedChaptersCount || 0,
      last_read_chapter_number: novel.lastReadChapterNumber || 1,
      translation_genre: novel.translationGenre || 'xianxia',
      glossary: novel.glossary || {},
      cookie_config: novel.cookieConfig || {},
      updated_at: novel.updatedAt || new Date().toISOString(),
    };

    const { error } = await client.from('novels').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error(`   ✗ Lỗi tải truyện "${novel.title}":`, error.message);
    } else {
      novelSuccess++;
      console.log(`   ✓ Đã tải: ${novel.title} (ID: ${novel.id})`);
    }
  }

  // 2. Upload chapters
  console.log('\n2. Đang tải lên danh sách Chapters...');
  let totalChaptersUploaded = 0;
  for (const [novelId, chaps] of Object.entries(chaptersMap)) {
    const list = chaps as any[];
    if (!list || list.length === 0) continue;

    console.log(`   * Đang đồng bộ ${list.length} chương của truyện [${novelId}]...`);
    const rows = list.map(c => ({
      id: c.id,
      novel_id: novelId,
      chapter_number: c.chapterNumber,
      title: c.title,
      translated_title: c.translatedTitle || null,
      source_url: c.sourceUrl || '',
      raw_content: c.rawContent || '',
      translated_content: c.translatedContent || null,
      translation_status: c.translationStatus || 'pending',
      translation_error: c.translationError || null,
      translated_at: c.translatedAt || null,
      word_count: c.wordCount || 0,
    }));

    // Chunk 50 chapters
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const { error } = await client.from('chapters').upsert(chunk, { onConflict: 'id' });
      if (error) {
        console.error(`     ✗ Lỗi tải chunk ${i} - ${i + chunk.length}:`, error.message);
      } else {
        totalChaptersUploaded += chunk.length;
      }
    }
  }

  console.log('\n======================================================');
  console.log(`🎉 HOÀN TẤT MIGRATE:`);
  console.log(`   - Tiểu thuyết: ${novelSuccess}/${novelsList.length} bộ`);
  console.log(`   - Chương truyện: ${totalChaptersUploaded} chương`);
  console.log('======================================================\n');
}

// -------------------------------------------------------------
// LỆNH 4: STATUS
// -------------------------------------------------------------
async function cmdStatus() {
  console.log('\n📊 Đang kiểm tra thống kê Supabase...');
  const client = getClient();

  const { count: novelCount, error: nErr } = await client
    .from('novels')
    .select('*', { count: 'exact', head: true });

  const { count: chapterCount, error: cErr } = await client
    .from('chapters')
    .select('*', { count: 'exact', head: true });

  const { count: transCount } = await client
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .eq('translation_status', 'translated');

  if (nErr) {
    console.error('❌ Lỗi truy vấn bảng novels:', nErr.message);
    return;
  }

  console.log('\n======================================================');
  console.log('📈 THỐNG KÊ DỮ LIỆU TRÊN SUPABASE:');
  console.log('======================================================');
  console.log(`📚 Tổng số tiểu thuyết:  ${novelCount ?? 0} bộ`);
  console.log(`📑 Tổng số chương truyện: ${chapterCount ?? 0} chương`);
  console.log(`✨ Số chương đã dịch AI:  ${transCount ?? 0} chương`);
  console.log('======================================================\n');
}

// -------------------------------------------------------------
// LỆNH 5: LIST NOVELS
// -------------------------------------------------------------
async function cmdList() {
  console.log('\n📚 Danh sách tiểu thuyết trong Supabase:');
  const client = getClient();

  const { data, error } = await client
    .from('novels')
    .select('id, title, author, chapters_count, translated_chapters_count, status, source_domain')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('❌ Lỗi:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('ℹ️ Hiện chưa có tiểu thuyết nào trong Supabase.');
    return;
  }

  console.table(
    data.map((n, idx) => ({
      '#': idx + 1,
      ID: n.id,
      'Tiêu đề': n.title,
      'Tác giả': n.author,
      'Số chương': `${n.translated_chapters_count}/${n.chapters_count}`,
      'Trạng thái': n.status,
      Nguồn: n.source_domain,
    }))
  );
  console.log('');
}

// -------------------------------------------------------------
// LỆNH 6: HELP
// -------------------------------------------------------------
function cmdHelp() {
  console.log(`
========================================================================
📖 HƯỚNG DẪN KẾT NỐI VÀ SỬ DỤNG SUPABASE CLI CHO WEBNOVEL SCRAPER
========================================================================

1. CÁC BƯỚC THIẾT LẬP SUPABASE:
------------------------------------------------------------------------
BƯỚC 1: Đăng ký & Tạo Project Supabase (Miễn phí)
  - Truy cập https://supabase.com và bấm "Start your project"
  - Tạo mới một Organization và chọn "New Project"
  - Đặt tên Project (ví dụ: story-scraper-hub) và mật khẩu Database

BƯỚC 2: Lấy thông tin kết nối API (Project URL & Anon Key)
  - Vào Project Dashboard -> chọn biểu tượng bánh răng "Project Settings" ở menu trái.
  - Chọn mục "API" (Data API).
  - Sao chép 2 giá trị:
      * Project URL (ví dụ: https://xyzcompany.supabase.co)
      * Project API keys: chọn key "anon" public (hoặc "service_role" bí mật)

BƯỚC 3: Cấu hình biến môi trường trong file .env
  - Tạo file .env ở thư mục gốc của dự án nếu chưa có:
      SUPABASE_URL="https://your-project.supabase.co"
      SUPABASE_ANON_KEY="eyJhbGciOi..."

BƯỚC 4: Tạo cấu trúc bảng cơ sở dữ liệu
  - Vào mục "SQL Editor" trên Supabase Dashboard -> Nhấp "New Query"
  - Sao chép toàn bộ nội dung file "supabase/schema.sql"
    (hoặc chạy lệnh: npx tsx scripts/supabase-cli.ts schema)
  - Bấm "RUN" để tạo bảng 'novels', 'chapters' và các phân quyền RLS.

2. CÁC LỆNH SUPABASE CLI TIỆN ÍCH:
------------------------------------------------------------------------
  • Kiểm tra kết nối:
    npx tsx scripts/supabase-cli.ts test
    (hoặc: npm run supabase:cli -- test)

  • Di chuyển dữ liệu truyện đã cào từ Local lên Supabase:
    npx tsx scripts/supabase-cli.ts migrate

  • Xem thống kê số lượng truyện & chương:
    npx tsx scripts/supabase-cli.ts status

  • Xem danh sách truyện hiện có:
    npx tsx scripts/supabase-cli.ts list

  • Xem lại hướng dẫn này:
    npx tsx scripts/supabase-cli.ts help

========================================================================
`);
}

// -------------------------------------------------------------
// MAIN ENTRY POINT
// -------------------------------------------------------------
const args = process.argv.slice(2);
const command = (args[0] || 'help').toLowerCase();

switch (command) {
  case 'test':
  case 'ping':
    cmdTest();
    break;
  case 'schema':
  case 'sql':
    cmdSchema();
    break;
  case 'migrate':
  case 'sync':
    cmdMigrate();
    break;
  case 'status':
  case 'stats':
    cmdStatus();
    break;
  case 'list':
  case 'ls':
    cmdList();
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    cmdHelp();
    break;
}
