'use client';

import React from 'react';
import { BookOpen, Compass, Sparkles, Terminal, BookMarked, Download } from 'lucide-react';

export type ActiveTab = 'library' | 'crawler' | 'translate' | 'api';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  novelsCount: number;
  totalChapters: number;
  translatedChapters: number;
  onOpenNewCrawler: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  novelsCount,
  totalChapters,
  translatedChapters,
  onOpenNewCrawler,
}: NavbarProps) {
  const tabs = [
    { id: 'library' as ActiveTab, label: 'Thư viện truyện', icon: BookMarked },
    { id: 'crawler' as ActiveTab, label: 'Cào truyện & Cookie VIP', icon: Compass },
    { id: 'translate' as ActiveTab, label: 'Xưởng dịch AI', icon: Sparkles },
    { id: 'api' as ActiveTab, label: 'Tích hợp API & OPDS', icon: Terminal },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 shadow-lg shadow-indigo-500/20">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">
                Novel<span className="text-amber-400">Flow</span>
              </span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
                AI & EPUB
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Cào truyện VIP • Dịch thuật Gemini • Xuất EPUB • API Reader
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 rounded-xl bg-slate-900/80 p-1 border border-slate-800/80">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-amber-300' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Quick Stats & CTA */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-4 text-xs text-slate-400 border-r border-slate-800 pr-4">
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-[11px]" title="Đã kết nối và đồng bộ với Firebase Cloud Firestore">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Firebase Cloud</span>
            </div>
            <div>
              <span className="text-slate-500">Truyện: </span>
              <span className="font-semibold text-slate-200">{novelsCount}</span>
            </div>
            <div>
              <span className="text-slate-500">Chương: </span>
              <span className="font-semibold text-slate-200">{totalChapters}</span>
            </div>
            <div>
              <span className="text-slate-500">Đã dịch: </span>
              <span className="font-semibold text-emerald-400">{translatedChapters}</span>
            </div>
          </div>

          <button
            onClick={onOpenNewCrawler}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 active:scale-95 transition-all"
          >
            <Compass className="h-4 w-4" />
            <span className="hidden sm:inline">Cào truyện mới</span>
            <span className="sm:hidden">Cào mới</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation bar */}
      <div className="flex md:hidden overflow-x-auto border-t border-slate-900 bg-slate-950 px-2 py-1 scrollbar-none">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                isActive ? 'bg-indigo-600/90 text-white' : 'text-slate-400'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
