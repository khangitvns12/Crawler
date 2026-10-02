'use client';

import React, { useState, useEffect } from 'react';
import { Novel, Chapter, TranslationGenre } from '@/types/novel';
import { cleanChapterTitle, formatChapterDisplayTitle } from '@/lib/chapter-utils';
import { 
  Sparkles, BookOpen, CheckCircle2, Clock, AlertCircle, RefreshCw, 
  Save, Play, Sliders, Plus, Trash2, Edit3, Eye, FileText
} from 'lucide-react';

interface TranslationViewProps {
  novels: Novel[];
  selectedNovelId?: string;
  onUpdateNovelGlossary: (novelId: string, glossary: Record<string, string>) => void;
  onChapterTranslated: (novelId: string, chapter: Chapter) => void;
  onReadChapter: (novel: Novel, chapterNumber: number) => void;
}

export default function TranslationView({
  novels,
  selectedNovelId,
  onUpdateNovelGlossary,
  onChapterTranslated,
  onReadChapter,
}: TranslationViewProps) {
  // Active novel ID selection
  const [internalNovelId, setInternalNovelId] = useState<string>('');
  const currentNovelId = selectedNovelId || internalNovelId || (novels.length > 0 ? novels[0].id : '');
  const activeNovel = novels.find(n => n.id === currentNovelId) || null;

  // Chapters list for active novel
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  // Translation configuration
  const [selectedGenre, setSelectedGenre] = useState<TranslationGenre | null>(null);
  const genre = selectedGenre ?? ((activeNovel?.translationGenre as TranslationGenre) || 'xianxia');
  const [selectedChapterNumbers, setSelectedChapterNumbers] = useState<number[]>([]);

  // Glossary Manager State
  const [showGlossaryModal, setShowGlossaryModal] = useState(false);
  const [customGlossary, setCustomGlossary] = useState<Record<string, string> | null>(null);
  const glossary = customGlossary ?? (activeNovel?.glossary || {});
  const [newOriginalTerm, setNewOriginalTerm] = useState('');
  const [newTranslatedTerm, setNewTranslatedTerm] = useState('');

  // Active translation queue
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatingChapterNumber, setTranslatingChapterNumber] = useState<number | null>(null);
  const [translateProgress, setTranslateProgress] = useState(0);
  const [translateLogs, setTranslateLogs] = useState<string[]>([]);

  // Side-by-side inspection
  const [inspectingChapter, setInspectingChapter] = useState<Chapter | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  const handleSelectInspectChapter = (ch: Chapter) => {
    setInspectingChapter(ch);
    setEditedTitle(ch.translatedTitle || ch.title);
    setEditedContent(ch.translatedContent || ch.rawContent || '');
    setSaveSuccessMsg(false);
  };

  // Fetch chapters when active novel changes
  useEffect(() => {
    if (!currentNovelId) return;
    let cancelled = false;

    fetch(`/api/novels/${currentNovelId}/chapters`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.success && Array.isArray(data.data)) {
          const sorted = [...data.data].sort((a, b) => a.chapterNumber - b.chapterNumber);
          setChapters(sorted);
          if (sorted.length > 0) {
            handleSelectInspectChapter(sorted[0]);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingChapters(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentNovelId]);

  // Toggle chapter selection
  const handleToggleSelectChapter = (num: number) => {
    setSelectedChapterNumbers(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  const handleSelectAllPending = () => {
    const pendingNums = chapters.filter(c => c.translationStatus !== 'translated').map(c => c.chapterNumber);
    setSelectedChapterNumbers(pendingNums);
  };

  const handleSelectAll = () => {
    if (selectedChapterNumbers.length === chapters.length) {
      setSelectedChapterNumbers([]);
    } else {
      setSelectedChapterNumbers(chapters.map(c => c.chapterNumber));
    }
  };

  // Add term to Glossary
  const handleAddGlossaryTerm = () => {
    if (!newOriginalTerm.trim() || !newTranslatedTerm.trim()) return;
    const updated = {
      ...glossary,
      [newOriginalTerm.trim()]: newTranslatedTerm.trim(),
    };
    setCustomGlossary(updated);
    if (activeNovel) {
      onUpdateNovelGlossary(activeNovel.id, updated);
    }
    setNewOriginalTerm('');
    setNewTranslatedTerm('');
  };

  const handleDeleteGlossaryTerm = (key: string) => {
    const updated = { ...glossary };
    delete updated[key];
    setCustomGlossary(updated);
    if (activeNovel) {
      onUpdateNovelGlossary(activeNovel.id, updated);
    }
  };

  // Save manual edit
  const handleSaveManualEdit = async () => {
    if (!activeNovel || !inspectingChapter) return;
    setIsSavingEdit(true);

    const cleanedTranslatedTitle = cleanChapterTitle(editedTitle.trim(), inspectingChapter.chapterNumber);

    try {
      const res = await fetch(`/api/novels/${activeNovel.id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          ...inspectingChapter,
          translatedTitle: cleanedTranslatedTitle,
          translatedContent: editedContent.trim(),
          translationStatus: 'translated',
          translatedAt: new Date().toISOString(),
        }]),
      });

      if (res.ok) {
        setSaveSuccessMsg(true);
        setTimeout(() => setSaveSuccessMsg(false), 2500);

        // Update local state
        const updated = {
          ...inspectingChapter,
          translatedTitle: cleanedTranslatedTitle,
          translatedContent: editedContent.trim(),
          translationStatus: 'translated' as const,
        };
        setInspectingChapter(updated);
        setChapters(prev => prev.map(c => c.chapterNumber === updated.chapterNumber ? updated : c));
        onChapterTranslated(activeNovel.id, updated);
      }
    } catch {
      // ignore
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Batch translate selected chapters
  const handleStartBatchTranslate = async () => {
    if (!activeNovel || selectedChapterNumbers.length === 0) return;

    setIsTranslating(true);
    setTranslateLogs([]);
    setTranslateProgress(0);

    const sortedNums = [...selectedChapterNumbers].sort((a, b) => a - b);

    for (let i = 0; i < sortedNums.length; i++) {
      const chapNum = sortedNums[i];
      const ch = chapters.find(c => c.chapterNumber === chapNum);
      if (!ch) continue;

      setTranslatingChapterNumber(chapNum);
      const displayTitle = formatChapterDisplayTitle(chapNum, ch.title);
      setTranslateLogs(prev => [
        `Đang dịch ${displayTitle}...`,
        ...prev.slice(0, 30),
      ]);

      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: ch.title,
            content: ch.rawContent,
            sourceLang: activeNovel.originalLanguage,
            targetLang: 'Tiếng Việt',
            genre,
            glossary,
            novelId: activeNovel.id,
            chapterNumber: chapNum,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lỗi dịch thuật');

        const cleanedTranslatedTitle = cleanChapterTitle(data.data.translatedTitle, chapNum);

        const updatedChapter: Chapter = {
          ...ch,
          translatedTitle: cleanedTranslatedTitle,
          translatedContent: data.data.translatedContent,
          translationStatus: 'translated',
          translatedAt: new Date().toISOString(),
        };

        // Update local list
        setChapters(prev => prev.map(c => c.chapterNumber === chapNum ? updatedChapter : c));
        onChapterTranslated(activeNovel.id, updatedChapter);

        if (inspectingChapter?.chapterNumber === chapNum) {
          setInspectingChapter(updatedChapter);
          setEditedTitle(updatedChapter.translatedTitle || '');
          setEditedContent(updatedChapter.translatedContent || '');
        }

        const translatedDisplay = formatChapterDisplayTitle(chapNum, cleanedTranslatedTitle);
        setTranslateLogs(prev => [
          `✓ Dịch xong ${translatedDisplay}`,
          ...prev.slice(0, 30),
        ]);
      } catch (err: unknown) {
        const errorText = err instanceof Error ? err.message : String(err);
        setTranslateLogs(prev => [
          `✗ Thất bại Chương ${chapNum}: ${errorText}`,
          ...prev.slice(0, 30),
        ]);
      }

      setTranslateProgress(Math.round(((i + 1) / sortedNums.length) * 100));
    }

    setIsTranslating(false);
    setTranslatingChapterNumber(null);
  };

  // Translate single inspecting chapter directly
  const handleTranslateCurrentChapter = async () => {
    if (!activeNovel || !inspectingChapter) return;
    setIsTranslating(true);
    setTranslatingChapterNumber(inspectingChapter.chapterNumber);

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: inspectingChapter.title,
          content: inspectingChapter.rawContent,
          sourceLang: activeNovel.originalLanguage,
          targetLang: 'Tiếng Việt',
          genre,
          glossary,
          novelId: activeNovel.id,
          chapterNumber: inspectingChapter.chapterNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi dịch thuật');

      const cleanedTranslatedTitle = cleanChapterTitle(data.data.translatedTitle, inspectingChapter.chapterNumber);

      const updatedChapter: Chapter = {
        ...inspectingChapter,
        translatedTitle: cleanedTranslatedTitle,
        translatedContent: data.data.translatedContent,
        translationStatus: 'translated',
        translatedAt: new Date().toISOString(),
      };

      setInspectingChapter(updatedChapter);
      setEditedTitle(updatedChapter.translatedTitle || '');
      setEditedContent(updatedChapter.translatedContent || '');
      setChapters(prev => prev.map(c => c.chapterNumber === inspectingChapter.chapterNumber ? updatedChapter : c));
      onChapterTranslated(activeNovel.id, updatedChapter);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTranslating(false);
      setTranslatingChapterNumber(null);
    }
  };

  if (!novels.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 py-20 text-center">
        <Sparkles className="h-12 w-12 text-slate-500 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">Chưa có truyện nào trong thư viện</h3>
        <p className="mt-1 max-w-sm text-xs text-slate-400">
          Hãy cào truyện trước hoặc tải dữ liệu để bắt đầu dịch thuật bằng AI.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Novel Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Xưởng dịch thuật tiểu thuyết AI
          </h1>
          <p className="text-sm text-slate-400">
            Dịch văn học chuyên sâu với Gemini. Tự động chuẩn hóa Hán Việt, duy trì từ điển thuật ngữ nhất quán.
          </p>
        </div>

        {/* Novel Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 shrink-0">Chọn truyện:</label>
          <select
            value={currentNovelId}
            onChange={e => setInternalNovelId(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-white focus:border-indigo-500 focus:outline-none max-w-xs truncate"
          >
            {novels.map(n => (
              <option key={n.id} value={n.id}>
                {n.title} ({n.translatedChaptersCount}/{n.chaptersCount} chương)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Control Panel: Style & Glossary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        {/* Genre Style */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Thể loại văn phong (Văn phong dịch AI):
          </label>
          <select
            value={genre}
            onChange={e => setSelectedGenre(e.target.value as TranslationGenre)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 px-3 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="xianxia">🐉 Tiên hiệp / Kiếm hiệp (Chuẩn Hán Việt)</option>
            <option value="lightnovel">🌸 Light Novel Nhật Bản (Dí dỏm, mượt mà)</option>
            <option value="modern">🏙️ Đô thị / Ngôn tình / Hiện đại</option>
            <option value="webnovel">⚔️ Kỳ ảo phương Tây / LitRPG / Sci-Fi</option>
            <option value="general">📖 Văn học tiêu chuẩn</option>
          </select>
        </div>

        {/* Glossary count & button */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Từ điển thuật ngữ (Glossary):
          </label>
          <button
            onClick={() => setShowGlossaryModal(!showGlossaryModal)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-700 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-amber-400" />
              <span>{Object.keys(glossary).length} thuật ngữ đã gán</span>
            </span>
            <span className="text-[11px] font-semibold text-indigo-400 hover:underline">
              {showGlossaryModal ? 'Đóng' : 'Quản lý'}
            </span>
          </button>
        </div>

        {/* Translation action */}
        <div className="flex flex-col justify-end">
          <button
            onClick={handleStartBatchTranslate}
            disabled={isTranslating || selectedChapterNumbers.length === 0}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 py-2 px-4 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 transition-all"
          >
            {isTranslating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Đang dịch ({translateProgress}%)...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                <span>Dịch các chương đã chọn ({selectedChapterNumbers.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Glossary Drawer / Modal */}
      {showGlossaryModal && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/15 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" /> Bảng từ điển dịch truyện riêng (Đồng bộ nhân vật, chiêu thức, bang phái)
            </h4>
            <span className="text-[10px] text-slate-400">
              Gemini sẽ bắt buộc dịch chính xác các từ này theo chỉ định.
            </span>
          </div>

          {/* Add Form */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newOriginalTerm}
              onChange={e => setNewOriginalTerm(e.target.value)}
              placeholder="Từ gốc (vd: 杨叶 hoặc フラン)"
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 py-1.5 px-3 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <input
              type="text"
              value={newTranslatedTerm}
              onChange={e => setNewTranslatedTerm(e.target.value)}
              placeholder="Dịch sang tiếng Việt (vd: Dương Diệp hoặc Fran)"
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 py-1.5 px-3 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              onClick={handleAddGlossaryTerm}
              className="flex items-center justify-center gap-1 rounded-xl bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm thuật ngữ
            </button>
          </div>

          {/* List of current glossary terms */}
          <div className="flex flex-wrap gap-2 pt-1 max-h-36 overflow-y-auto">
            {Object.entries(glossary).map(([orig, trans]) => (
              <span
                key={orig}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-xs text-slate-200"
              >
                <span className="font-mono text-slate-400">{orig}</span>
                <span className="text-amber-400 font-bold">→</span>
                <span className="font-semibold text-slate-100">{trans}</span>
                <button
                  onClick={() => handleDeleteGlossaryTerm(orig)}
                  className="ml-1 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main Workspace: Left Chapter Table, Right Side-by-Side Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Chapters List & Selection (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col h-[750px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Danh sách chương ({chapters.length})
              </h3>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <button
                onClick={handleSelectAllPending}
                className="text-amber-400 hover:underline"
              >
                Chọn chưa dịch
              </button>
              <span className="text-slate-600">|</span>
              <button
                onClick={handleSelectAll}
                className="text-indigo-400 hover:underline"
              >
                {selectedChapterNumbers.length === chapters.length ? 'Bỏ chọn' : 'Chọn tất cả'}
              </button>
            </div>
          </div>

          {/* Chapters Scrollable List */}
          <div className="flex-1 overflow-y-auto py-2 space-y-1.5 pr-1 scrollbar-thin">
            {isLoadingChapters ? (
              <div className="flex items-center justify-center py-12 text-xs text-slate-400">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Đang tải danh sách chương...
              </div>
            ) : chapters.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500">
                Chưa có chương nào.
              </div>
            ) : (
              chapters.map(ch => {
                const isSelected = selectedChapterNumbers.includes(ch.chapterNumber);
                const isInspecting = inspectingChapter?.chapterNumber === ch.chapterNumber;
                const isTranslated = ch.translationStatus === 'translated';
                const isBeingTranslated = translatingChapterNumber === ch.chapterNumber;

                return (
                  <div
                    key={ch.id}
                    className={`flex items-center justify-between rounded-xl p-2.5 text-xs transition-all cursor-pointer ${
                      isInspecting
                        ? 'border border-indigo-500/50 bg-indigo-950/40 text-white'
                        : 'border border-transparent bg-slate-950/50 hover:bg-slate-800/40 text-slate-300'
                    }`}
                    onClick={() => handleSelectInspectChapter(ch)}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleSelectChapter(ch.chapterNumber);
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 shrink-0"
                      />
                      <div className="truncate">
                        <div className="font-semibold truncate">
                          {formatChapterDisplayTitle(ch.chapterNumber, ch.title, ch.translatedTitle)}
                        </div>
                        {ch.translatedTitle && (
                          <div className="text-[10px] text-slate-500 truncate">
                            Gốc: {cleanChapterTitle(ch.title, ch.chapterNumber)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isBeingTranslated ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                      ) : isTranslated ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-slate-500" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Side-by-side / Inspection Workspace (8 cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col h-[750px]">
          {inspectingChapter ? (
            <div className="flex flex-col h-full space-y-4">
              {/* Top bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                      Chương {inspectingChapter.chapterNumber}
                    </span>
                    <span className="text-xs text-slate-400">
                      Độ dài gốc: {inspectingChapter.wordCount} chữ
                    </span>
                    {inspectingChapter.translationStatus === 'translated' && (
                      <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        Đã dịch
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Read in Offline Reader */}
                  {activeNovel && (
                    <button
                      onClick={() => onReadChapter(activeNovel, inspectingChapter.chapterNumber)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
                      title="Mở trong trình đọc toàn màn hình"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-amber-400" />
                      <span>Đọc thử</span>
                    </button>
                  )}

                  {/* Translate this chapter with AI */}
                  <button
                    onClick={handleTranslateCurrentChapter}
                    disabled={isTranslating}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Dịch AI chương này</span>
                  </button>
                </div>
              </div>

              {/* Title editor */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Tiêu đề bản dịch:
                </label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={e => setEditedTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 px-3 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                  placeholder="Tiêu đề chương sau khi dịch"
                />
              </div>

              {/* Side-by-side Text Areas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
                {/* Left: Original Raw Content */}
                <div className="flex flex-col rounded-xl border border-slate-800/90 bg-slate-950 p-3 overflow-hidden">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-900 text-xs font-semibold text-slate-400">
                    <span>Bản gốc ({activeNovel?.originalLanguage?.toUpperCase() || 'RAW'})</span>
                    <span className="text-[10px] text-slate-500">Chỉ đọc</span>
                  </div>
                  <div className="flex-1 overflow-y-auto font-serif text-xs text-slate-300 leading-relaxed whitespace-pre-wrap pr-1 scrollbar-thin">
                    {inspectingChapter.rawContent || 'Không có nội dung gốc.'}
                  </div>
                </div>

                {/* Right: Translated Content (Editable) */}
                <div className="flex flex-col rounded-xl border border-indigo-500/30 bg-slate-950 p-3 overflow-hidden">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-900 text-xs font-semibold text-indigo-300">
                    <span>Bản dịch AI tiếng Việt</span>
                    <span className="text-[10px] text-slate-400">Có thể chỉnh sửa</span>
                  </div>
                  <textarea
                    value={editedContent}
                    onChange={e => setEditedContent(e.target.value)}
                    placeholder="Nội dung chương dịch sẽ xuất hiện ở đây..."
                    className="flex-1 resize-none rounded-lg bg-transparent font-serif text-xs text-slate-100 leading-relaxed focus:outline-none whitespace-pre-wrap pr-1 scrollbar-thin"
                  />
                </div>
              </div>

              {/* Save manual edit bar */}
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {saveSuccessMsg && (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> Đã lưu bản chỉnh sửa thành công!
                    </span>
                  )}
                </span>

                <button
                  onClick={handleSaveManualEdit}
                  disabled={isSavingEdit}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 active:scale-95 transition-all shadow-md shadow-emerald-600/20"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Lưu chỉnh sửa vào Thư viện</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 text-xs">
              <FileText className="h-8 w-8 mb-2 text-slate-600" />
              <span>Chọn một chương ở danh sách bên trái để xem và dịch</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
