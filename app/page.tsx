'use client';

import React, { useState, useEffect } from 'react';
import { Novel, Chapter } from '@/types/novel';
import Navbar, { ActiveTab } from '@/components/Navbar';
import LibraryView from '@/components/LibraryView';
import CrawlerView from '@/components/CrawlerView';
import TranslationView from '@/components/TranslationView';
import ApiDocsView from '@/components/ApiDocsView';
import ReaderModal from '@/components/ReaderModal';
import EpubExportModal from '@/components/EpubExportModal';
import NovelDetailModal from '@/components/NovelDetailModal';
import SupabaseModal from '@/components/SupabaseModal';
import { useRealtimeNovels } from '@/hooks/useRealtimeNovels';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, Sparkles, Download, Terminal, BookOpen, ChevronRight, ShieldCheck, Radio } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('library');

  // Unified Realtime synchronization hook (Supabase Realtime + SSE + BroadcastChannel)
  const {
    novels,
    setNovels,
    isLoading,
    isRealtimeConnected,
    realtimeProvider,
    lastEvent,
    refreshNovels,
    deleteNovel,
    addOrUpdateNovel,
  } = useRealtimeNovels();

  // Modals state
  const [readingNovel, setReadingNovel] = useState<Novel | null>(null);
  const [readingChapterNum, setReadingChapterNum] = useState<number>(1);
  const [exportingEpubNovel, setExportingEpubNovel] = useState<Novel | null>(null);
  const [detailNovel, setDetailNovel] = useState<Novel | null>(null);
  const [selectedTranslateNovelId, setSelectedTranslateNovelId] = useState<string | undefined>(undefined);
  const [resumeNovel, setResumeNovel] = useState<Novel | null>(null);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);

  // Compute metrics
  const totalChapters = novels.reduce((acc, n) => acc + (n.chaptersCount || 0), 0);
  const totalTranslated = novels.reduce((acc, n) => acc + (n.translatedChaptersCount || 0), 0);

  // Handlers
  const handleOpenReader = (novel: Novel, chapterNum: number = 1) => {
    setReadingNovel(novel);
    setReadingChapterNum(chapterNum);
  };

  const handleOpenTranslate = (novel: Novel) => {
    setSelectedTranslateNovelId(novel.id);
    setActiveTab('translate');
  };

  const handleResumeCrawl = (novel: Novel) => {
    setResumeNovel(novel);
    setActiveTab('crawler');
  };

  const handleNovelCrawled = (newNovel: Novel, chapters: Chapter[]) => {
    addOrUpdateNovel(newNovel);
  };

  const handleChapterTranslated = (novelId: string, updatedChapter: Chapter) => {
    setNovels(prev =>
      prev.map(n => {
        if (n.id === novelId) {
          const newTranslatedCount = Math.min(n.chaptersCount, (n.translatedChaptersCount || 0) + 1);
          return {
            ...n,
            translatedChaptersCount: newTranslatedCount,
          };
        }
        return n;
      })
    );
  };

  const handleUpdateNovelGlossary = (novelId: string, glossary: Record<string, string>) => {
    setNovels(prev =>
      prev.map(n => (n.id === novelId ? { ...n, glossary } : n))
    );
    // Sync to server
    fetch(`/api/novels/${novelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ glossary }),
    }).catch(() => {});
  };

  const handleDeleteNovel = async (id: string) => {
    await deleteNovel(id);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white flex flex-col">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        novelsCount={novels.length}
        totalChapters={totalChapters}
        translatedChapters={totalTranslated}
        onOpenNewCrawler={() => setActiveTab('crawler')}
        isRealtimeConnected={isRealtimeConnected}
        realtimeProvider={realtimeProvider}
        onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
      />

      {/* Realtime Live Event Toast */}
      <AnimatePresence>
        {lastEvent && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-16 right-4 z-50 flex items-center gap-2.5 rounded-xl bg-slate-900/95 border border-emerald-500/40 px-3.5 py-2 text-xs font-semibold text-emerald-300 shadow-xl shadow-emerald-500/10 backdrop-blur-md"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>{lastEvent}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Banner for first-time or contextual presence */}
      {activeTab === 'library' && novels.length > 0 && (
        <section className="relative overflow-hidden border-b border-slate-900 bg-gradient-to-b from-slate-900/60 to-slate-950 py-10 px-4 sm:px-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
          <div className="relative mx-auto max-w-7xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-2xl space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-400">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  Công cụ cào và dịch truyện tiểu thuyết tự động
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  Đọc & Dịch Tiểu Thuyết Mạng Mọi Nguồn Không Giới Hạn
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Cào trực tiếp truyện raw Trung (69Shuba, Biquge), Nhật (Syosetu), Anh (NovelFull) với sự hỗ trợ của Cookie VIP. Dịch thuật văn phong thuần Việt mượt mà bằng Gemini và xuất sách EPUB chuẩn cho máy đọc sách.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setActiveTab('crawler')}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 active:scale-95 transition-all"
                >
                  <Compass className="h-4 w-4" />
                  <span>Cào truyện bằng URL</span>
                </button>

                <button
                  onClick={() => setActiveTab('api')}
                  className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-all"
                >
                  <Terminal className="h-4 w-4 text-indigo-400" />
                  <span>OPDS & API Reader</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <AnimatePresence mode="wait">
          {activeTab === 'library' && (
            <motion.div
              key="library"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <LibraryView
                novels={novels}
                onSelectNovelToRead={novel => handleOpenReader(novel, 1)}
                onSelectNovelToTranslate={handleOpenTranslate}
                onResumeCrawl={handleResumeCrawl}
                onOpenEpubExport={novel => setExportingEpubNovel(novel)}
                onOpenNovelDetail={novel => setDetailNovel(novel)}
                onOpenNewCrawler={() => {
                  setResumeNovel(null);
                  setActiveTab('crawler');
                }}
                onDeleteNovel={handleDeleteNovel}
                onRefreshNovels={refreshNovels}
              />
            </motion.div>
          )}

          {activeTab === 'crawler' && (
            <motion.div
              key="crawler"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <CrawlerView
                key={resumeNovel ? resumeNovel.id : 'new-crawler'}
                resumeNovel={resumeNovel}
                onClearResumeNovel={() => setResumeNovel(null)}
                onNovelCrawled={handleNovelCrawled}
                onGoToTranslate={novel => {
                  setSelectedTranslateNovelId(novel.id);
                  setActiveTab('translate');
                }}
              />
            </motion.div>
          )}

          {activeTab === 'translate' && (
            <motion.div
              key="translate"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <TranslationView
                novels={novels}
                selectedNovelId={selectedTranslateNovelId}
                onUpdateNovelGlossary={handleUpdateNovelGlossary}
                onChapterTranslated={handleChapterTranslated}
                onReadChapter={(novel, chapNum) => handleOpenReader(novel, chapNum)}
              />
            </motion.div>
          )}

          {activeTab === 'api' && (
            <motion.div
              key="api"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <ApiDocsView novels={novels} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">NovelFlow</span>
            <span>•</span>
            <span>Nền tảng cào truyện có Cookie VIP & Dịch thuật AI</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span>Hỗ trợ EPUB 3 / NCX</span>
            <span>•</span>
            <span>Chuẩn OPDS Catalog</span>
            <span>•</span>
            <span>Powered by Gemini AI</span>
          </div>
        </div>
      </footer>

      {/* Global Modals */}
      {/* 1. Offline Reader Modal */}
      {readingNovel && (
        <ReaderModal
          novel={readingNovel}
          initialChapterNumber={readingChapterNum}
          onClose={() => setReadingNovel(null)}
          onChapterChange={num => setReadingChapterNum(num)}
        />
      )}

      {/* 2. EPUB Export Modal */}
      {exportingEpubNovel && (
        <EpubExportModal
          novel={exportingEpubNovel}
          onClose={() => setExportingEpubNovel(null)}
        />
      )}

      {/* 3. Novel Detail & Chapter Manager Modal */}
      {detailNovel && (
        <NovelDetailModal
          novel={detailNovel}
          onClose={() => setDetailNovel(null)}
          onUpdateNovel={updated => {
            setNovels(prev => prev.map(n => n.id === updated.id ? updated : n));
            setDetailNovel(updated);
          }}
          onReadChapter={(n, chapNum) => handleOpenReader(n, chapNum)}
          onTranslateNovel={n => handleOpenTranslate(n)}
          onResumeCrawl={handleResumeCrawl}
          onOpenEpub={n => setExportingEpubNovel(n)}
          onDeleteNovel={handleDeleteNovel}
        />
      )}

      {/* 4. Supabase Connection & CLI Modal */}
      {isSupabaseModalOpen && (
        <SupabaseModal onClose={() => setIsSupabaseModalOpen(false)} />
      )}
    </div>
  );
}
