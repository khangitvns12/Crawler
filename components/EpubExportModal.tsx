'use client';

import React, { useState } from 'react';
import { Novel } from '@/types/novel';
import { 
  X, Download, BookOpen, Check, Copy, ExternalLink, 
  Smartphone, Monitor, Tablet, RefreshCw
} from 'lucide-react';

interface EpubExportModalProps {
  novel: Novel;
  onClose: () => void;
}

export default function EpubExportModal({ novel, onClose }: EpubExportModalProps) {
  const [contentType, setContentType] = useState<'translated' | 'original' | 'both'>('translated');
  const [includeToc, setIncludeToc] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const downloadApiUrl = `/api/v1/novels/${novel.id}/epub?type=${contentType}&toc=${includeToc}`;
  const fullDownloadUrl = typeof window !== 'undefined' ? `${window.location.origin}${downloadApiUrl}` : downloadApiUrl;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(downloadApiUrl);
      if (!response.ok) throw new Error('Không thể tạo file EPUB');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (novel.title || 'novel').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, '_');
      a.download = `${safeTitle}.epub`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi tải file EPUB');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(fullDownloadUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Xuất sách điện tử EPUB Offline</h2>
            <p className="text-xs text-slate-400">
              Tạo file EPUB tiêu chuẩn tương thích mọi máy đọc sách và ứng dụng đọc truyện
            </p>
          </div>
        </div>

        {/* Novel Card Preview */}
        <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 mb-5">
          {novel.coverUrl ? (
            <img
              src={novel.coverUrl}
              alt={novel.title}
              className="h-20 w-14 rounded-lg object-cover border border-slate-800 shrink-0"
            />
          ) : (
            <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-500">
              <BookOpen className="h-6 w-6" />
            </div>
          )}
          <div className="overflow-hidden">
            <h3 className="font-bold text-sm text-slate-100 truncate">{novel.title}</h3>
            <p className="text-xs text-slate-400">Tác giả: {novel.author}</p>
            <p className="text-xs text-emerald-400 mt-1 font-medium">
              Tổng số {novel.chaptersCount} chương ({novel.translatedChaptersCount} chương đã dịch)
            </p>
          </div>
        </div>

        {/* Export Options */}
        <div className="space-y-4 mb-6">
          {/* Format selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Phiên bản nội dung:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setContentType('translated')}
                className={`rounded-xl border p-2.5 text-center text-xs font-semibold transition-all ${
                  contentType === 'translated'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                Bản dịch tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setContentType('both')}
                className={`rounded-xl border p-2.5 text-center text-xs font-semibold transition-all ${
                  contentType === 'both'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                Song ngữ đối chiếu
              </button>
              <button
                type="button"
                onClick={() => setContentType('original')}
                className={`rounded-xl border p-2.5 text-center text-xs font-semibold transition-all ${
                  contentType === 'original'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                Bản gốc nguyên tác
              </button>
            </div>
          </div>

          {/* Include TOC checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="includeToc"
              checked={includeToc}
              onChange={e => setIncludeToc(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-0"
            />
            <label htmlFor="includeToc" className="text-xs text-slate-300 select-none cursor-pointer">
              Bao gồm mục lục điện tử (EPUB 3 Navigation & EPUB 2 NCX)
            </label>
          </div>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all"
        >
          {isDownloading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Đang đóng gói file EPUB...</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span>Tải file .EPUB về máy ngay</span>
            </>
          )}
        </button>

        {/* Copy Download Link for Moon+ Reader / WebDAV */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span className="truncate max-w-[280px]">Link tải trực tiếp: <code className="font-mono text-[11px] text-slate-300">{downloadApiUrl}</code></span>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 font-semibold text-indigo-400 hover:text-indigo-300 ml-2 shrink-0"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Đã chép</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Chép link</span>
              </>
            )}
          </button>
        </div>

        {/* Reader Compatibility Tips */}
        <div className="mt-4 rounded-xl bg-slate-950 p-3 text-[11px] text-slate-400 space-y-1.5 border border-slate-800/60">
          <div className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5 text-amber-400" /> Tương thích hoàn hảo:
          </div>
          <div>• <b>iPhone / iPad / Mac:</b> Mở trực tiếp bằng Apple Books.</div>
          <div>• <b>Android:</b> Khuyên dùng Moon+ Reader, ReadEra, Lithium hoặc FBReader.</div>
          <div>• <b>Kindle:</b> Sử dụng tính năng &quot;Send to Kindle&quot; qua email hoặc web Amazon.</div>
        </div>
      </div>
    </div>
  );
}
