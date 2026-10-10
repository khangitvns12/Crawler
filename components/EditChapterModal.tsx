'use client';

import React, { useState, useEffect } from 'react';
import { Chapter, TranslationGenre } from '@/types/novel';
import { safeFetchJson } from '@/lib/safe-json';
import { getActiveApiKeyStrings } from '@/lib/api-key-storage';
import { 
  X, Save, Sparkles, RefreshCw, CheckCircle2, AlertCircle, 
  FileText, Languages, Hash, Database 
} from 'lucide-react';

interface EditChapterModalProps {
  novelId: string;
  novelTitle?: string;
  chapterNumber: number;
  initialChapter?: Chapter;
  translationGenre?: TranslationGenre;
  onClose: () => void;
  onSaved: (updatedChapter: Chapter) => void;
}

export default function EditChapterModal({
  novelId,
  novelTitle,
  chapterNumber,
  initialChapter,
  translationGenre = 'general',
  onClose,
  onSaved,
}: EditChapterModalProps) {
  const [chapter, setChapter] = useState<Chapter | null>(initialChapter || null);
  const [loadedKey, setLoadedKey] = useState<string>(
    (!initialChapter || (!initialChapter.rawContent && !initialChapter.translatedContent)) ? '' : `${novelId}:${chapterNumber}`
  );
  const isLoading = loadedKey !== `${novelId}:${chapterNumber}`;
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Form fields
  const [chapNum, setChapNum] = useState<number>(chapterNumber);
  const [rawTitle, setRawTitle] = useState(initialChapter?.title || '');
  const [translatedTitle, setTranslatedTitle] = useState(initialChapter?.translatedTitle || '');
  const [rawContent, setRawContent] = useState(initialChapter?.rawContent || '');
  const [translatedContent, setTranslatedContent] = useState(initialChapter?.translatedContent || '');
  const [status, setStatus] = useState<Chapter['translationStatus']>(initialChapter?.translationStatus || 'pending');

  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // If chapter content wasn't loaded (e.g. only lightweight headers in memory), fetch full content
  useEffect(() => {
    let active = true;
    if (!initialChapter || (!initialChapter.rawContent && !initialChapter.translatedContent)) {
      safeFetchJson<any>(`/api/novels/${novelId}/chapters/${chapterNumber}`)
        .then(({ ok, data, error }) => {
          if (!active) return;
          if (ok && data?.data) {
            const ch = data.data as Chapter;
            setChapter(ch);
            setChapNum(ch.chapterNumber);
            setRawTitle(ch.title || '');
            setTranslatedTitle(ch.translatedTitle || '');
            setRawContent(ch.rawContent || '');
            setTranslatedContent(ch.translatedContent || '');
            setStatus(ch.translationStatus || 'pending');
          } else {
            setFeedback({ message: error || 'Không thể tải nội dung chi tiết của chương', type: 'error' });
          }
        })
        .finally(() => {
          if (active) setLoadedKey(`${novelId}:${chapterNumber}`);
        });
    }

    return () => {
      active = false;
    };
  }, [novelId, chapterNumber, initialChapter]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Quick AI translation for this chapter
  const handleAiTranslate = async () => {
    if (!rawContent.trim() && !rawTitle.trim()) {
      showToast('Chưa có nội dung hoặc tiêu đề gốc để dịch.', 'error');
      return;
    }

    setIsTranslating(true);
    showToast('Đang gửi nội dung sang Gemini AI để dịch...', 'info');

    try {
      const activeKeys = getActiveApiKeyStrings();
      const { ok, data, error } = await safeFetchJson<any>('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: rawTitle,
          content: rawContent,
          targetLang: 'Tiếng Việt',
          genre: translationGenre,
          apiKeys: activeKeys,
        }),
      });

      if (!ok || !data?.data) {
        throw new Error(error || data?.error || 'Lỗi khi gọi API dịch thuật');
      }

      const res = data.data;
      if (res.translatedTitle) setTranslatedTitle(res.translatedTitle);
      if (res.translatedContent) setTranslatedContent(res.translatedContent);
      setStatus('translated');
      showToast('✓ AI đã dịch xong! Nhấn "Lưu vào Supabase" để lưu lại.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`✗ Lỗi dịch thuật: ${msg}`, 'error');
    } finally {
      setIsTranslating(false);
    }
  };

  // Save changes to Supabase & Server
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rawTitle.trim() && !translatedTitle.trim()) {
      showToast('Tiêu đề chương không được để trống.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const { ok, data, error } = await safeFetchJson<any>(`/api/novels/${novelId}/chapters/${chapterNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterNumber: chapNum,
          title: rawTitle.trim(),
          translatedTitle: translatedTitle.trim() || undefined,
          rawContent: rawContent.trim(),
          translatedContent: translatedContent.trim() || undefined,
          translationStatus: status,
        }),
      });

      if (!ok || !data?.success) {
        throw new Error(error || data?.error || 'Không thể lưu chương vào Supabase');
      }

      showToast('✓ Đã cập nhật và lưu thành công vào Supabase!', 'success');
      if (data.data) {
        onSaved(data.data as Chapter);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`✗ Lỗi lưu chương: ${msg}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Chỉnh sửa Chương {chapNum}</h3>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  Lưu Supabase
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-md">
                {novelTitle ? `${novelTitle} • ` : ''}Chỉnh sửa tiêu đề, nội dung gốc & bản dịch
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback message banner */}
        {feedback && (
          <div
            className={`mx-6 mt-4 rounded-xl px-4 py-2.5 text-xs font-medium border flex items-center gap-2 transition-all shrink-0 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : feedback.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : feedback.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            ) : (
              <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Body Form */}
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-amber-400" />
            <span>Đang nạp toàn văn Chương {chapterNumber}...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-thin">
            {/* Metadata Fields (Chapter number, status, titles) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <Hash className="h-3 w-3 text-amber-400" /> Số chương:
                </label>
                <input
                  type="number"
                  min={1}
                  value={chapNum}
                  onChange={e => setChapNum(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <Languages className="h-3 w-3 text-emerald-400" /> Trạng thái dịch:
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as Chapter['translationStatus'])}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="pending">⏳ Chưa dịch (Pending)</option>
                  <option value="translated">✓ Đã dịch (Translated)</option>
                  <option value="error">⚠️ Lỗi dịch (Error)</option>
                </select>
              </div>

              <div className="sm:col-span-5 flex items-end">
                <button
                  type="button"
                  onClick={handleAiTranslate}
                  disabled={isTranslating}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-md hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isTranslating ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Đang dịch AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                      <span>Dịch chương này bằng AI</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Title Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Tiêu đề gốc (Raw Title):
                </label>
                <input
                  type="text"
                  value={rawTitle}
                  onChange={e => setRawTitle(e.target.value)}
                  placeholder="Ví dụ: 第一章 破限成圣"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center justify-between">
                  <span>Tiêu đề bản dịch (Tiếng Việt):</span>
                  {translatedTitle && <span className="text-[10px] text-emerald-400 font-normal">Đã có tiêu đề dịch</span>}
                </label>
                <input
                  type="text"
                  value={translatedTitle}
                  onChange={e => setTranslatedTitle(e.target.value)}
                  placeholder="Ví dụ: Chương 1: Phá Hạn Thành Thánh"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-emerald-300 font-medium placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Side-by-side Text Content Editors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Raw Content */}
              <div className="flex flex-col space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Nội dung gốc:</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {rawContent.split(/\s+/).filter(Boolean).length} từ
                  </span>
                </div>
                <textarea
                  rows={12}
                  value={rawContent}
                  onChange={e => setRawContent(e.target.value)}
                  placeholder="Dán hoặc chỉnh sửa văn bản gốc..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200 placeholder-slate-600 leading-relaxed font-sans focus:border-amber-500 focus:outline-none resize-y scrollbar-thin"
                />
              </div>

              {/* Translated Content */}
              <div className="flex flex-col space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-emerald-400">Bản dịch Tiếng Việt:</span>
                  <span className="text-[10px] text-emerald-400/70 font-mono">
                    {translatedContent.split(/\s+/).filter(Boolean).length} từ
                  </span>
                </div>
                <textarea
                  rows={12}
                  value={translatedContent}
                  onChange={e => {
                    setTranslatedContent(e.target.value);
                    if (e.target.value.trim() && status !== 'translated') {
                      setStatus('translated');
                    }
                  }}
                  placeholder="Chỉnh sửa hoặc dán bản dịch Tiếng Việt..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-100 placeholder-slate-600 leading-relaxed font-sans focus:border-emerald-500 focus:outline-none resize-y scrollbar-thin"
                />
              </div>
            </div>
          </form>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-950 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving || isLoading}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Đang lưu Supabase...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Lưu thay đổi vào Supabase</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
