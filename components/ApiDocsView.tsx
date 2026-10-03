'use client';

import React, { useState } from 'react';
import { Novel } from '@/types/novel';
import { safeFetchJson } from '@/lib/safe-json';
import { 
  Terminal, Globe, Copy, Check, ExternalLink, Play, 
  Code2, Download, Upload, ShieldCheck, Smartphone, BookOpen,
  Layers, CheckCircle2, RefreshCw
} from 'lucide-react';

interface ApiDocsViewProps {
  novels: Novel[];
  onImportNovels?: (imported: Novel[]) => void;
}

export default function ApiDocsView({ novels, onImportNovels }: ApiDocsViewProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeSnippetTab, setActiveSnippetTab] = useState<'curl' | 'js' | 'python'>('curl');

  // Interactive Runner state
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('/api/v1/novels');
  const [testResponse, setTestResponse] = useState<any>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const [testStatusCode, setTestStatusCode] = useState<number | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const opdsFeedUrl = `${baseUrl}/api/v1/opds`;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const sampleNovelId = novels.length > 0 ? novels[0].id : 'sample-id';

  // Run live test
  const handleRunTest = async () => {
    setIsLoadingTest(true);
    setTestResponse(null);
    setTestStatusCode(null);

    const targetUrl = selectedEndpoint.replace('{id}', sampleNovelId).replace('{chapterNum}', '1');
    try {
      const { ok, status, data, rawText, error } = await safeFetchJson<any>(targetUrl);
      setTestStatusCode(status);
      if (data !== undefined) {
        setTestResponse(data);
      } else {
        setTestResponse({ status, error, responseBodyPreview: rawText?.slice(0, 500) });
      }
    } catch (err: unknown) {
      setTestResponse({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsLoadingTest(false);
    }
  };

  // Export JSON backup of library
  const handleExportBackup = () => {
    const dataStr = JSON.stringify(novels, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novelflow-library-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Tích hợp API & OPDS Reader
        </h1>
        <p className="text-sm text-slate-400">
          Dễ dàng tích hợp thư viện truyện vào các ứng dụng đọc truyện nổi tiếng như Moon+ Reader, FBReader, LNReader, Tachiyomi hoặc ứng dụng riêng của bạn.
        </p>
      </div>

      {/* Hero Feature: OPDS Catalog Feed */}
      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">OPDS 1.2 Catalog Feed (Chuẩn quốc tế)</h3>
                <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
                  Khuyên dùng
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tương thích trực tiếp với Moon+ Reader, FBReader, KyBook, Aldiko, PocketBook.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleCopy(opdsFeedUrl, 'opds')}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 active:scale-95 transition-all shadow-md shrink-0"
          >
            {copiedKey === 'opds' ? (
              <>
                <Check className="h-4 w-4 text-emerald-300" />
                <span>Đã sao chép link OPDS!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Sao chép link OPDS Feed</span>
              </>
            )}
          </button>
        </div>

        {/* OPDS URL Bar */}
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-mono text-xs text-indigo-300">
          <Globe className="h-4 w-4 text-indigo-400 shrink-0" />
          <span className="truncate select-all">{opdsFeedUrl}</span>
        </div>

        {/* Step-by-step Guide for Moon+ Reader */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 text-xs space-y-2">
          <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-amber-400" /> 4 bước kết nối vào ứng dụng đọc truyện Moon+ Reader trên điện thoại:
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-400 pl-1 leading-relaxed">
            <li>Mở ứng dụng <b>Moon+ Reader</b> (hoặc FBReader) trên điện thoại Android/iOS.</li>
            <li>Tại menu chính, chọn <b>&quot;Thư viện mạng&quot; (Net Library)</b>.</li>
            <li>Nhấn vào biểu tượng <b>&quot;Thêm danh mục mới&quot; (Add new catalog)</b>.</li>
            <li>Điền tên <code>NovelFlow</code> và dán đường dẫn OPDS ở trên vào ô URL. Nhấn Lưu!</li>
            <li>Toàn bộ sách đã tải và dịch trên web sẽ xuất hiện trên điện thoại của bạn, sẵn sàng tải EPUB đọc offline chỉ với 1 chạm.</li>
          </ol>
        </div>
      </div>

      {/* REST API Endpoints Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="h-5 w-5 text-amber-400" />
              Danh sách REST API Endpoints v1
            </h3>
            <p className="text-xs text-slate-400">
              Các endpoint công khai hỗ trợ CORS đầy đủ để tích hợp vào ứng dụng đọc truyện bên ngoài.
            </p>
          </div>

          <a
            href="/api/v1/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors"
          >
            <Code2 className="h-3.5 w-3.5 text-indigo-400" />
            <span>OpenAPI JSON</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-semibold">
              <tr>
                <th className="py-2.5 px-4 w-20">Method</th>
                <th className="py-2.5 px-4">Endpoint</th>
                <th className="py-2.5 px-4">Mô tả</th>
                <th className="py-2.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              <tr>
                <td className="py-3 px-4 font-mono font-bold text-emerald-400">GET</td>
                <td className="py-3 px-4 font-mono text-slate-200">/api/v1/novels</td>
                <td className="py-3 px-4 text-slate-400">Lấy danh sách tất cả tiểu thuyết đã tải trong thư viện</td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleCopy(`${baseUrl}/api/v1/novels`, 'e1')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    {copiedKey === 'e1' ? 'Đã chép' : 'Sao chép'}
                  </button>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono font-bold text-emerald-400">GET</td>
                <td className="py-3 px-4 font-mono text-slate-200">/api/v1/novels/&#123;id&#125;</td>
                <td className="py-3 px-4 text-slate-400">Lấy chi tiết truyện và danh sách các chương</td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleCopy(`${baseUrl}/api/v1/novels/${sampleNovelId}`, 'e2')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    {copiedKey === 'e2' ? 'Đã chép' : 'Sao chép'}
                  </button>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono font-bold text-emerald-400">GET</td>
                <td className="py-3 px-4 font-mono text-slate-200">/api/v1/novels/&#123;id&#125;/chapters/&#123;chapterNum&#125;</td>
                <td className="py-3 px-4 text-slate-400">Lấy nội dung văn bản 1 chương (param: ?format=translated|original|both)</td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleCopy(`${baseUrl}/api/v1/novels/${sampleNovelId}/chapters/1`, 'e3')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    {copiedKey === 'e3' ? 'Đã chép' : 'Sao chép'}
                  </button>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono font-bold text-emerald-400">GET</td>
                <td className="py-3 px-4 font-mono text-slate-200">/api/v1/novels/&#123;id&#125;/epub</td>
                <td className="py-3 px-4 text-slate-400">Tải trực tiếp file ebook định dạng EPUB chuẩn offline</td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleCopy(`${baseUrl}/api/v1/novels/${sampleNovelId}/epub`, 'e4')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    {copiedKey === 'e4' ? 'Đã chép' : 'Sao chép'}
                  </button>
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-mono font-bold text-emerald-400">GET</td>
                <td className="py-3 px-4 font-mono text-slate-200">/api/v1/opds</td>
                <td className="py-3 px-4 text-slate-400">Catalog Atom XML chuẩn OPDS cho các e-reader apps</td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleCopy(`${baseUrl}/api/v1/opds`, 'e5')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    {copiedKey === 'e5' ? 'Đã chép' : 'Sao chép'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive API Tester & Code Snippets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive API Tester (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Play className="h-4 w-4 text-emerald-400" /> Thử nghiệm API trực tiếp (Interactive Runner)
            </h4>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedEndpoint}
              onChange={e => setSelectedEndpoint(e.target.value)}
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 py-2 px-3 text-xs text-slate-200 focus:border-amber-500 focus:outline-none font-mono"
            >
              <option value="/api/v1/novels">GET /api/v1/novels (Danh sách truyện)</option>
              <option value="/api/v1/novels/{id}">GET /api/v1/novels/&#123;id&#125; (Chi tiết truyện & mục lục)</option>
              <option value="/api/v1/novels/{id}/chapters/{chapterNum}">GET /api/v1/novels/.../chapters/1 (Nội dung chương 1)</option>
            </select>

            <button
              onClick={handleRunTest}
              disabled={isLoadingTest}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {isLoadingTest ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Đang gọi...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Gửi Request</span>
                </>
              )}
            </button>
          </div>

          {/* Test Response Window */}
          {testResponse && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-400">Response Payload:</span>
                <span className={`font-mono font-bold ${testStatusCode === 200 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  HTTP {testStatusCode}
                </span>
              </div>
              <pre className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-slate-300 scrollbar-thin">
                {JSON.stringify(testResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Right: Code Snippets (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Code2 className="h-4 w-4 text-indigo-400" /> Mã nguồn tích hợp mẫu
            </h4>
            <div className="flex items-center gap-1 rounded-lg bg-slate-950 p-0.5 border border-slate-800">
              <button
                onClick={() => setActiveSnippetTab('curl')}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${activeSnippetTab === 'curl' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
              >
                cURL
              </button>
              <button
                onClick={() => setActiveSnippetTab('js')}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${activeSnippetTab === 'js' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
              >
                Fetch (JS)
              </button>
              <button
                onClick={() => setActiveSnippetTab('python')}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${activeSnippetTab === 'python' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
              >
                Python
              </button>
            </div>
          </div>

          <div className="relative">
            <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-[11px] text-slate-300 leading-relaxed max-h-64">
              {activeSnippetTab === 'curl' && `curl -X GET "${baseUrl}/api/v1/novels" \\
  -H "Accept: application/json"`}

              {activeSnippetTab === 'js' && `// Lấy danh sách truyện trong ứng dụng React / Vue / Flutter
const response = await fetch('${baseUrl}/api/v1/novels');
const { data } = await response.json();
console.log(data); // Array of novels`}

              {activeSnippetTab === 'python' && `import requests

res = requests.get("${baseUrl}/api/v1/novels")
novels = res.json()["data"]
for novel in novels:
    print(f"Title: {novel['title']}, Chapters: {novel['chaptersCount']}")`}
            </pre>
          </div>

          {/* Backup Library CTA */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-400">Sao lưu dữ liệu thư viện:</span>
            <button
              onClick={handleExportBackup}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Xuất JSON Backup</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
