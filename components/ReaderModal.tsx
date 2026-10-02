'use client';

import React, { useState, useEffect } from 'react';
import { Novel, Chapter } from '@/types/novel';
import { cleanChapterTitle, formatChapterDisplayTitle } from '@/lib/chapter-utils';
import { 
  X, ChevronLeft, ChevronRight, BookOpen, Settings, List, 
  Sun, Moon, Compass, Sparkles, Sliders
} from 'lucide-react';

interface ReaderModalProps {
  novel: Novel;
  initialChapterNumber?: number;
  onClose: () => void;
  onChapterChange?: (chapterNumber: number) => void;
}

type ReaderTheme = 'oled' | 'sepia' | 'light';
type ReaderLanguage = 'translated' | 'original' | 'both';

export default function ReaderModal({
  novel,
  initialChapterNumber = 1,
  onClose,
  onChapterChange,
}: ReaderModalProps) {
  const [currentChapterNumber, setCurrentChapterNumber] = useState(initialChapterNumber);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Reader Settings
  const [theme, setTheme] = useState<ReaderTheme>('oled');
  const [fontSize, setFontSize] = useState<number>(18);
  const [lineHeight, setLineHeight] = useState<number>(1.8);
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans'>('serif');
  const [displayLanguage, setDisplayLanguage] = useState<ReaderLanguage>('translated');
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);

  // Fetch all chapters
  useEffect(() => {
    let active = true;
    fetch(`/api/novels/${novel.id}/chapters`)
      .then(res => res.json())
      .then(data => {
        if (active && data.success && Array.isArray(data.data)) {
          setChapters(data.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [novel.id]);

  const currentChapter = chapters.find(c => c.chapterNumber === currentChapterNumber) || chapters[0] || null;

  const changeChapterNumber = React.useCallback((num: number) => {
    setCurrentChapterNumber(num);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (onChapterChange) onChapterChange(num);
  }, [onChapterChange]);

  // Keyboard navigation (Arrow keys, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        const nextChap = chapters.find(c => c.chapterNumber === currentChapterNumber + 1);
        if (nextChap) changeChapterNumber(nextChap.chapterNumber);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        const prevChap = chapters.find(c => c.chapterNumber === currentChapterNumber - 1);
        if (prevChap) changeChapterNumber(prevChap.chapterNumber);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentChapterNumber, chapters, onClose, changeChapterNumber]);

  const handleNextChapter = () => {
    const nextChap = chapters.find(c => c.chapterNumber === currentChapterNumber + 1);
    if (nextChap) changeChapterNumber(nextChap.chapterNumber);
  };

  const handlePrevChapter = () => {
    const prevChap = chapters.find(c => c.chapterNumber === currentChapterNumber - 1);
    if (prevChap) changeChapterNumber(prevChap.chapterNumber);
  };

  // Theme style classes
  const getThemeClasses = () => {
    switch (theme) {
      case 'sepia':
        return 'bg-[#fbf0d9] text-[#2c2214] selection:bg-[#ecd7b0]';
      case 'light':
        return 'bg-[#f8fafc] text-[#0f172a] selection:bg-indigo-100';
      case 'oled':
      default:
        return 'bg-[#030712] text-[#e2e8f0] selection:bg-indigo-900';
    }
  };

  const getHeaderClasses = () => {
    switch (theme) {
      case 'sepia':
        return 'bg-[#f4e6c7]/90 border-[#ecd7b0] text-[#2c2214]';
      case 'light':
        return 'bg-white/90 border-slate-200 text-slate-800';
      case 'oled':
      default:
        return 'bg-slate-950/90 border-slate-800 text-slate-200';
    }
  };

  // Render content paragraphs based on language mode
  const renderContent = () => {
    if (!currentChapter) {
      return <p className="italic text-slate-500">Đang tải nội dung chương...</p>;
    }

    if (displayLanguage === 'original') {
      return (
        <div className="space-y-6">
          {(currentChapter.rawContent || 'Chưa có nội dung gốc.').split(/\n\s*\n/).map((p, idx) => (
            <p key={idx} className="indent-6 leading-relaxed">
              {p.trim()}
            </p>
          ))}
        </div>
      );
    }

    if (displayLanguage === 'both') {
      const rawParas = (currentChapter.rawContent || '').split(/\n\s*\n/).filter(Boolean);
      const transParas = (currentChapter.translatedContent || currentChapter.rawContent || '').split(/\n\s*\n/).filter(Boolean);
      const maxLen = Math.max(rawParas.length, transParas.length);

      return (
        <div className="space-y-8">
          {Array.from({ length: maxLen }).map((_, idx) => (
            <div key={idx} className="space-y-2 border-l-2 border-amber-500/40 pl-4 py-1">
              {rawParas[idx] && (
                <div className="text-[0.9em] opacity-70 italic font-mono">
                  {rawParas[idx]}
                </div>
              )}
              {transParas[idx] && (
                <div className="leading-relaxed">
                  {transParas[idx]}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Default: Translated
    const content = currentChapter.translatedContent || currentChapter.rawContent || 'Chương này chưa có nội dung.';
    const isTranslated = !!currentChapter.translatedContent;

    return (
      <div className="space-y-6">
        {!isTranslated && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 mb-6">
            ⚠️ Chương này chưa được dịch AI. Hiện đang hiển thị bản gốc. Bạn có thể bấm vào Xưởng dịch AI để dịch chương này!
          </div>
        )}
        {content.split(/\n\s*\n/).map((p, idx) => (
          <p key={idx} className="indent-6 leading-relaxed">
            {p.trim()}
          </p>
        ))}
      </div>
    );
  };

  const hasNext = chapters.some(c => c.chapterNumber === currentChapterNumber + 1);
  const hasPrev = chapters.some(c => c.chapterNumber === currentChapterNumber - 1);

  return (
    <div className={`fixed inset-0 z-50 overflow-y-auto ${getThemeClasses()} transition-colors duration-200`}>
      {/* Top Floating Control Bar */}
      <header className={`sticky top-0 z-20 border-b backdrop-blur-md px-4 py-3 ${getHeaderClasses()}`}>
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          {/* Novel Title & Current Chapter */}
          <div className="flex items-center gap-3 overflow-hidden">
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              title="Thoát trình đọc (Esc)"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="truncate">
              <h2 className="text-xs font-bold truncate opacity-80">{novel.title}</h2>
              <div className="text-sm font-extrabold truncate">
                {formatChapterDisplayTitle(currentChapterNumber, currentChapter?.title, currentChapter?.translatedTitle)}
              </div>
            </div>
          </div>

          {/* Right Actions: TOC, Settings */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Language Switch */}
            <div className="hidden sm:flex items-center rounded-lg border border-black/10 dark:border-white/10 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setDisplayLanguage('translated')}
                className={`rounded px-2 py-1 ${displayLanguage === 'translated' ? 'bg-amber-500 text-slate-950' : 'opacity-70'}`}
              >
                Bản dịch
              </button>
              <button
                onClick={() => setDisplayLanguage('both')}
                className={`rounded px-2 py-1 ${displayLanguage === 'both' ? 'bg-amber-500 text-slate-950' : 'opacity-70'}`}
              >
                Song ngữ
              </button>
              <button
                onClick={() => setDisplayLanguage('original')}
                className={`rounded px-2 py-1 ${displayLanguage === 'original' ? 'bg-amber-500 text-slate-950' : 'opacity-70'}`}
              >
                Gốc
              </button>
            </div>

            {/* TOC Drawer Button */}
            <button
              onClick={() => setShowToc(!showToc)}
              className="rounded-lg p-2 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              title="Mục lục chương"
            >
              <List className="h-4 w-4" />
            </button>

            {/* Settings Toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-lg p-2 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              title="Tùy chỉnh giao diện đọc"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Reader Customization Settings Drawer */}
        {showSettings && (
          <div className="mx-auto max-w-4xl border-t border-black/10 dark:border-white/10 mt-3 pt-3 flex flex-wrap items-center justify-between gap-4 text-xs">
            {/* Themes */}
            <div className="flex items-center gap-2">
              <span className="opacity-70 font-semibold">Chủ đề:</span>
              <button
                onClick={() => setTheme('oled')}
                className={`rounded-lg px-2.5 py-1 font-bold ${theme === 'oled' ? 'bg-indigo-600 text-white' : 'bg-black/20 text-slate-300'}`}
              >
                Tối OLED
              </button>
              <button
                onClick={() => setTheme('sepia')}
                className={`rounded-lg px-2.5 py-1 font-bold ${theme === 'sepia' ? 'bg-amber-700 text-white' : 'bg-[#e8d5b5] text-[#2c2214]'}`}
              >
                Giấy cổ
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`rounded-lg px-2.5 py-1 font-bold ${theme === 'light' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-800'}`}
              >
                Sáng
              </button>
            </div>

            {/* Font family */}
            <div className="flex items-center gap-2">
              <span className="opacity-70 font-semibold">Font:</span>
              <button
                onClick={() => setFontFamily('serif')}
                className={`rounded-lg px-2.5 py-1 font-serif ${fontFamily === 'serif' ? 'bg-amber-500 text-slate-950 font-bold' : 'opacity-70'}`}
              >
                Merriweather (Serif)
              </button>
              <button
                onClick={() => setFontFamily('sans')}
                className={`rounded-lg px-2.5 py-1 font-sans ${fontFamily === 'sans' ? 'bg-amber-500 text-slate-950 font-bold' : 'opacity-70'}`}
              >
                Sans
              </button>
            </div>

            {/* Font size */}
            <div className="flex items-center gap-2">
              <span className="opacity-70 font-semibold">Cỡ chữ ({fontSize}px):</span>
              <button
                onClick={() => setFontSize(Math.max(14, fontSize - 1))}
                className="rounded border border-black/20 dark:border-white/20 px-2 py-0.5 font-bold"
              >
                A-
              </button>
              <button
                onClick={() => setFontSize(Math.min(30, fontSize + 1))}
                className="rounded border border-black/20 dark:border-white/20 px-2 py-0.5 font-bold"
              >
                A+
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Reading View */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        {/* Chapter Title */}
        <div className="mb-10 text-center">
          <div className="text-xs uppercase tracking-widest opacity-60 font-semibold mb-2">
            {novel.title}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            {formatChapterDisplayTitle(currentChapterNumber, currentChapter?.title, currentChapter?.translatedTitle)}
          </h1>
          {currentChapter?.translatedTitle && (
            <div className="text-xs opacity-60 italic">
              Tiêu đề gốc: {cleanChapterTitle(currentChapter.title, currentChapterNumber)}
            </div>
          )}
          <div className="mt-4 flex items-center justify-center gap-3 text-xs opacity-60">
            <span>{currentChapter?.wordCount || 0} từ</span>
            <span>•</span>
            <span>Tác giả: {novel.author}</span>
          </div>
        </div>

        {/* Chapter Body Content */}
        <article
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
            fontFamily: fontFamily === 'serif' ? '"Merriweather", "Georgia", serif' : 'system-ui, sans-serif',
          }}
          className="text-justify select-text"
        >
          {renderContent()}
        </article>

        {/* Bottom Pagination Bar */}
        <div className="mt-16 pt-8 border-t border-black/10 dark:border-white/10 flex items-center justify-between">
          <button
            onClick={handlePrevChapter}
            disabled={!hasPrev}
            className="flex items-center gap-2 rounded-xl border border-black/15 dark:border-white/15 px-4 py-2 text-xs font-semibold disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Chương trước</span>
          </button>

          <span className="text-xs opacity-70 font-medium">
            Chương {currentChapterNumber} / {chapters.length}
          </span>

          <button
            onClick={handleNextChapter}
            disabled={!hasNext}
            className="flex items-center gap-2 rounded-xl bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold disabled:opacity-30 hover:bg-amber-400 transition-all shadow-md shadow-amber-500/20"
          >
            <span>Chương tiếp theo</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </main>

      {/* Table of Contents Drawer */}
      {showToc && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end" onClick={() => setShowToc(false)}>
          <div
            className={`w-full max-w-sm h-full ${getThemeClasses()} p-5 flex flex-col border-l border-slate-800 shadow-2xl`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
              <h3 className="font-bold text-sm">Mục lục ({chapters.length} chương)</h3>
              <button onClick={() => setShowToc(false)} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-1 pr-1 scrollbar-thin">
              {chapters.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => {
                    changeChapterNumber(ch.chapterNumber);
                    setShowToc(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-lg text-xs truncate transition-all ${
                    ch.chapterNumber === currentChapterNumber
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-80'
                  }`}
                >
                  {formatChapterDisplayTitle(ch.chapterNumber, ch.title, ch.translatedTitle)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
