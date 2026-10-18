import fs from 'fs';
import path from 'path';
import { Novel, Chapter } from '@/types/novel';
import { cleanChapterTitle, sanitizeChapter, sanitizeChapters } from './chapter-utils';
import { areNovelsMatching, getCanonicalNovelKey } from './crawler-engine';
import {
  isSupabaseConfigured,
  fetchSupabaseNovels,
  saveSupabaseNovel,
  deleteSupabaseNovel,
  fetchSupabaseChapters,
  fetchSupabaseChapter,
  saveSupabaseChapters,
  deleteSupabaseChapter,
} from './supabase';

interface StorageState {
  novels: Record<string, Novel>;
  chapters: Record<string, Chapter[]>; // novelId -> chapters
}

const DB_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DB_DIR, 'novels-db.json');

class ServerStorage {
  private state: StorageState = { novels: {}, chapters: {} };
  private isHydrating: boolean = false;

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          this.state = {
            novels: data.novels || {},
            chapters: data.chapters || {},
          };
          // Filter out legacy dummy seed novels if present
          delete this.state.novels['seed-kiem-ton-1'];
          delete this.state.novels['seed-tai-sinh-kiem-2'];
          delete this.state.chapters['seed-kiem-ton-1'];
          delete this.state.chapters['seed-tai-sinh-kiem-2'];
        }
      }
    } catch {
      this.state = { novels: {}, chapters: {} };
    }

    // Hydrate directly from Supabase on server startup
    if (isSupabaseConfigured()) {
      this.hydrateFromSupabase();
    }
  }

  public async hydrateFromSupabase(): Promise<void> {
    if (!isSupabaseConfigured() || this.isHydrating) return;
    this.isHydrating = true;
    try {
      const novels = await fetchSupabaseNovels();
      if (novels && Array.isArray(novels)) {
        this.state.novels = {};
        novels.forEach(n => {
          this.state.novels[n.id] = n;
        });
        this.saveState();
      }
    } catch (err) {
      console.warn('Supabase hydration note:', err);
    } finally {
      this.isHydrating = false;
    }
  }

  public async syncWithSupabase(): Promise<{
    success: boolean;
    configured: boolean;
    message: string;
    syncedNovelsCount: number;
    syncedChaptersCount: number;
  }> {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        configured: false,
        message: 'Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY',
        syncedNovelsCount: 0,
        syncedChaptersCount: 0,
      };
    }

    try {
      const remoteNovels = await fetchSupabaseNovels();
      this.state.novels = {};
      const remoteIds = new Set(remoteNovels.map(n => n.id));

      for (const remoteNovel of remoteNovels) {
        this.state.novels[remoteNovel.id] = remoteNovel;
      }

      // Prune local cached chapters that no longer exist in Supabase
      Object.keys(this.state.chapters).forEach(id => {
        if (!remoteIds.has(id)) {
          delete this.state.chapters[id];
        }
      });

      this.saveState();

      return {
        success: true,
        configured: true,
        message: `Đã đồng bộ ${remoteNovels.length} truyện từ cơ sở dữ liệu Supabase`,
        syncedNovelsCount: remoteNovels.length,
        syncedChaptersCount: Object.values(this.state.chapters).reduce((acc, c) => acc + c.length, 0),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Sync with Supabase note:', msg);
      return {
        success: false,
        configured: true,
        message: `Lỗi đồng bộ Supabase: ${msg}`,
        syncedNovelsCount: 0,
        syncedChaptersCount: 0,
      };
    }
  }

  private saveState() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch {
      // Non-fatal if disk write fails
    }
  }

  public getAllNovels(): Novel[] {
    const list = Object.values(this.state.novels);
    return list.map(novel => {
      const chaps = this.state.chapters[novel.id] || [];
      const translatedCount = chaps.filter(c => c.translationStatus === 'translated').length;
      return {
        ...novel,
        chaptersCount: Math.max(novel.chaptersCount || 0, chaps.length),
        translatedChaptersCount: Math.max(novel.translatedChaptersCount || 0, translatedCount),
      };
    });
  }

  /**
   * Supabase-first authoritative novels fetcher
   */
  public async getAllNovelsAsync(): Promise<Novel[]> {
    if (isSupabaseConfigured()) {
      try {
        const remoteNovels = await fetchSupabaseNovels();
        if (Array.isArray(remoteNovels)) {
          this.state.novels = {};
          remoteNovels.forEach(n => {
            this.state.novels[n.id] = n;
          });
          this.saveState();
          return remoteNovels;
        }
      } catch (err) {
        console.warn('getAllNovelsAsync Supabase note:', err);
      }
    }
    return this.getAllNovels();
  }

  public getNovel(id: string): Novel | null {
    return this.state.novels[id] || null;
  }

  public getNovelById(id: string): Novel | null {
    return this.getNovel(id);
  }

  public async getNovelByIdAsync(id: string): Promise<Novel | null> {
    const existing = this.getNovel(id);
    if (existing) return existing;
    if (isSupabaseConfigured()) {
      await this.getAllNovelsAsync();
      return this.getNovel(id);
    }
    return null;
  }

  public getChapters(novelId: string): Chapter[] {
    const list = this.state.chapters[novelId] || [];
    return sanitizeChapters(list);
  }

  public async getChaptersAsync(novelId: string, forceRefresh: boolean = false): Promise<Chapter[]> {
    let list = this.getChapters(novelId);
    const expectedCount = this.state.novels[novelId]?.chaptersCount || 0;

    if (!forceRefresh && list.length > 0 && (expectedCount === 0 || list.length >= expectedCount)) {
      return sanitizeChapters(list);
    }

    if (isSupabaseConfigured()) {
      try {
        const remote = await fetchSupabaseChapters(novelId);
        if (remote && remote.length > 0) {
          this.state.chapters[novelId] = remote;
          if (this.state.novels[novelId] && remote.length > (this.state.novels[novelId].chaptersCount || 0)) {
            this.state.novels[novelId].chaptersCount = remote.length;
          }
          this.saveState();
          return remote;
        }
      } catch (e) {
        console.warn('Supabase getChaptersAsync warning:', e);
      }
    }

    return list;
  }

  public getChapter(novelId: string, chapterNumber: number): Chapter | null {
    const chapters = this.getChapters(novelId);
    return chapters.find(c => c.chapterNumber === chapterNumber) || null;
  }

  public async getChapterAsync(novelId: string, chapterNumber: number): Promise<Chapter | null> {
    const cached = this.getChapter(novelId, chapterNumber);
    if (cached) return cached;

    if (isSupabaseConfigured()) {
      try {
        const remote = await fetchSupabaseChapter(novelId, chapterNumber);
        if (remote) {
          if (!this.state.chapters[novelId]) {
            this.state.chapters[novelId] = [];
          }
          const idx = this.state.chapters[novelId].findIndex(c => c.chapterNumber === chapterNumber);
          if (idx >= 0) {
            this.state.chapters[novelId][idx] = remote;
          } else {
            this.state.chapters[novelId].push(remote);
            this.state.chapters[novelId].sort((a, b) => a.chapterNumber - b.chapterNumber);
          }
          this.saveState();
          return remote;
        }
      } catch (e) {
        console.warn('Supabase getChapterAsync warning:', e);
      }
    }

    return null;
  }

  /**
   * Search for an existing novel in memory matching candidate sourceUrl, canonical key, or title
   */
  public findExistingNovel(candidate: {
    id?: string;
    sourceUrl?: string;
    title?: string;
    originalTitle?: string;
  }): Novel | null {
    if (!candidate) return null;
    if (candidate.id && this.state.novels[candidate.id]) {
      return this.state.novels[candidate.id];
    }
    const novels = Object.values(this.state.novels);
    return novels.find(n => areNovelsMatching(n, candidate)) || null;
  }

  public saveNovel(novel: Novel): Novel {
    // Check if another novel already exists matching this novel (by canonical key, source URL, or title)
    const matchingNovel = this.findExistingNovel(novel);
    const targetId = matchingNovel ? matchingNovel.id : novel.id;

    // If a different ID was matched, redirect chapters and merge metadata
    if (matchingNovel && matchingNovel.id !== novel.id) {
      console.log(`[ServerStorage Deduplication] Phát hiện truyện trùng lặp "${novel.title}". Tự động gộp vào truyện đã có ID: ${targetId}`);
      if (this.state.chapters[novel.id] && this.state.chapters[novel.id].length > 0) {
        if (!this.state.chapters[targetId]) {
          this.state.chapters[targetId] = [];
        }
        for (const orphanChap of this.state.chapters[novel.id]) {
          orphanChap.novelId = targetId;
          const existsIdx = this.state.chapters[targetId].findIndex(c => c.chapterNumber === orphanChap.chapterNumber);
          if (existsIdx >= 0) {
            this.state.chapters[targetId][existsIdx] = {
              ...this.state.chapters[targetId][existsIdx],
              ...orphanChap,
            };
          } else {
            this.state.chapters[targetId].push(orphanChap);
          }
        }
        this.state.chapters[targetId].sort((a, b) => a.chapterNumber - b.chapterNumber);
        delete this.state.chapters[novel.id];
      }
      delete this.state.novels[novel.id];
    }

    const existing = this.state.novels[targetId] || matchingNovel;
    const chaps = this.state.chapters[targetId] || [];
    const translatedCount = chaps.filter(c => c.translationStatus === 'translated').length;

    const updated: Novel = {
      ...(existing || {}),
      ...novel,
      id: targetId,
      title: (novel.title && novel.title !== 'Truyện không tên') ? novel.title : (existing?.title || novel.title),
      originalTitle: existing?.originalTitle || novel.originalTitle,
      author: (novel.author && novel.author !== 'Khuyết danh') ? novel.author : (existing?.author || novel.author),
      description: novel.description || existing?.description || '',
      coverUrl: novel.coverUrl || existing?.coverUrl || '',
      sourceUrl: novel.sourceUrl || existing?.sourceUrl || '',
      sourceDomain: novel.sourceDomain || existing?.sourceDomain || '',
      chaptersCount: Math.max(novel.chaptersCount || 0, chaps.length, existing?.chaptersCount || 0),
      translatedChaptersCount: Math.max(novel.translatedChaptersCount || 0, translatedCount, existing?.translatedChaptersCount || 0),
      createdAt: existing?.createdAt || novel.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.state.novels[targetId] = updated;
    this.saveState();
    return updated;
  }

  public async saveNovelAsync(novel: Novel): Promise<Novel> {
    const saved = this.saveNovel(novel);
    if (isSupabaseConfigured()) {
      await saveSupabaseNovel(saved);
    }
    return saved;
  }

  /**
   * Scan and reconcile all duplicate novels in database, merging chapters into primary novel
   */
  public async reconcileDuplicateNovels(): Promise<{ mergedCount: number }> {
    const novels = Object.values(this.state.novels);
    let mergedCount = 0;
    const toDeleteIds: string[] = [];

    for (let i = 0; i < novels.length; i++) {
      for (let j = i + 1; j < novels.length; j++) {
        const novelA = novels[i];
        const novelB = novels[j];
        if (!novelA || !novelB || novelA.id === novelB.id) continue;
        if (toDeleteIds.includes(novelA.id) || toDeleteIds.includes(novelB.id)) continue;

        if (areNovelsMatching(novelA, novelB)) {
          console.log(`[Deduplication] Gộp 2 truyện trùng: "${novelA.title}" (${novelA.id}) và "${novelB.title}" (${novelB.id})`);
          // novelA is primary, novelB is merged into novelA
          const chapsB = await this.getChaptersAsync(novelB.id);
          if (chapsB.length > 0) {
            chapsB.forEach(c => { c.novelId = novelA.id; });
            await this.saveChaptersAsync(chapsB, novelA);
          }
          toDeleteIds.push(novelB.id);
          delete this.state.novels[novelB.id];
          delete this.state.chapters[novelB.id];
          if (isSupabaseConfigured()) {
            await deleteSupabaseNovel(novelB.id);
          }
          mergedCount++;
        }
      }
    }

    if (mergedCount > 0) {
      this.saveState();
    }
    return { mergedCount };
  }

  public deleteNovel(id: string): boolean {
    const existed = Boolean(this.state.novels[id]);
    delete this.state.novels[id];
    delete this.state.chapters[id];
    this.saveState();
    return existed;
  }

  public async deleteNovelAsync(id: string): Promise<boolean> {
    this.deleteNovel(id);
    if (isSupabaseConfigured()) {
      try {
        await deleteSupabaseNovel(id);
      } catch (e) {
        console.warn('Supabase deleteNovel error:', e);
      }
    }
    return true;
  }

  public saveChapter(chapter: Chapter, novelFallback?: Novel): Chapter {
    const cleanChap = sanitizeChapter(chapter);
    if (!this.state.chapters[cleanChap.novelId]) {
      this.state.chapters[cleanChap.novelId] = [];
    }

    const list = this.state.chapters[cleanChap.novelId];
    const existingIndex = list.findIndex(c => c.chapterNumber === cleanChap.chapterNumber);

    if (existingIndex >= 0) {
      list[existingIndex] = {
        ...list[existingIndex],
        ...cleanChap,
      };
    } else {
      list.push(cleanChap);
      list.sort((a, b) => a.chapterNumber - b.chapterNumber);
    }

    const parentNovel = this.state.novels[cleanChap.novelId] || novelFallback;
    if (parentNovel) {
      parentNovel.chaptersCount = list.length;
      parentNovel.translatedChaptersCount = list.filter(c => c.translationStatus === 'translated').length;
      parentNovel.updatedAt = new Date().toISOString();
      this.state.novels[cleanChap.novelId] = parentNovel;
    }

    this.saveState();
    return cleanChap;
  }

  public async saveChapterAsync(chapter: Chapter, novelFallback?: Novel): Promise<Chapter> {
    const saved = this.saveChapter(chapter, novelFallback);
    const parentNovel = this.state.novels[saved.novelId] || novelFallback;
    if (isSupabaseConfigured()) {
      await saveSupabaseChapters([saved], parentNovel);
    }
    return saved;
  }

  public saveChapters(chapters: Chapter[], novelFallback?: Novel): void {
    const cleanList = sanitizeChapters(chapters);
    for (const ch of cleanList) {
      this.saveChapter(ch, novelFallback);
    }
  }

  public async saveChaptersAsync(chapters: Chapter[], novelFallback?: Novel): Promise<void> {
    const cleanList = sanitizeChapters(chapters);
    for (const ch of cleanList) {
      this.saveChapter(ch, novelFallback);
    }
    const parentNovel = novelFallback || (cleanList.length > 0 ? this.state.novels[cleanList[0].novelId] : undefined);
    if (isSupabaseConfigured()) {
      await saveSupabaseChapters(cleanList, parentNovel);
    }
  }

  public updateChapterTranslation(
    novelId: string,
    chapterNumber: number,
    translatedTitle: string,
    translatedContent: string
  ): Chapter | null {
    const ch = this.getChapter(novelId, chapterNumber);
    if (!ch) return null;
    ch.translatedTitle = cleanChapterTitle(translatedTitle, chapterNumber);
    ch.translatedContent = translatedContent;
    ch.translationStatus = 'translated';
    ch.translatedAt = new Date().toISOString();
    this.saveChapter(ch);
    return ch;
  }

  public deleteChapter(novelId: string, chapterNumber: number): boolean {
    if (!this.state.chapters[novelId]) return false;
    const initialLen = this.state.chapters[novelId].length;
    this.state.chapters[novelId] = this.state.chapters[novelId].filter(
      c => c.chapterNumber !== chapterNumber
    );
    const deleted = this.state.chapters[novelId].length < initialLen;
    if (deleted) {
      const parentNovel = this.state.novels[novelId];
      if (parentNovel) {
        parentNovel.chaptersCount = this.state.chapters[novelId].length;
        parentNovel.translatedChaptersCount = this.state.chapters[novelId].filter(
          c => c.translationStatus === 'translated'
        ).length;
        parentNovel.updatedAt = new Date().toISOString();
        this.state.novels[novelId] = parentNovel;
      }
      this.saveState();
    }
    return deleted;
  }

  public async deleteChapterAsync(novelId: string, chapterNumber: number): Promise<boolean> {
    this.deleteChapter(novelId, chapterNumber);
    if (isSupabaseConfigured()) {
      try {
        await deleteSupabaseChapter(novelId, chapterNumber);
      } catch (err) {
        console.warn('Supabase deleteChapterAsync error:', err);
      }
    }
    return true;
  }
}

// Global singleton instance
const globalForStorage = global as unknown as { serverStorage?: ServerStorage };
export const serverStorage = globalForStorage.serverStorage || new ServerStorage();
if (process.env.NODE_ENV !== 'production') {
  globalForStorage.serverStorage = serverStorage;
}
