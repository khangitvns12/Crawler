'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Novel, Chapter } from '@/types/novel';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseRowToNovel } from '@/lib/supabase';

export type RealtimeProvider = 'supabase' | 'sse' | 'polling' | 'disconnected';

export interface UseRealtimeNovelsReturn {
  novels: Novel[];
  setNovels: React.Dispatch<React.SetStateAction<Novel[]>>;
  isLoading: boolean;
  isRealtimeConnected: boolean;
  realtimeProvider: RealtimeProvider;
  lastEvent: string | null;
  refreshNovels: () => Promise<void>;
  deleteNovel: (id: string) => Promise<boolean>;
  addOrUpdateNovel: (novel: Novel) => void;
}

export function useRealtimeNovels(): UseRealtimeNovelsReturn {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);
  const [realtimeProvider, setRealtimeProvider] = useState<RealtimeProvider>('disconnected');
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const supabaseClientRef = useRef<SupabaseClient | null>(null);

  // Set transient banner/toast message
  const triggerEventToast = useCallback((msg: string) => {
    setLastEvent(msg);
    const timer = setTimeout(() => {
      setLastEvent(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch full list from API
  const refreshNovels = useCallback(async () => {
    try {
      const res = await fetch('/api/novels');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setNovels(data.data);
      }
    } catch (err) {
      console.warn('Error fetching novels list:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 1. Initial Load
  useEffect(() => {
    refreshNovels();
  }, [refreshNovels]);

  // 2. Setup Cross-Tab Broadcast Channel
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    try {
      const channel = new BroadcastChannel('novelflow_realtime_sync');
      broadcastChannelRef.current = channel;

      channel.onmessage = (event: MessageEvent) => {
        const payload = event.data;
        if (!payload || !payload.type) return;

        if (payload.type === 'novel_created' && payload.novel) {
          setNovels(prev => {
            const exists = prev.some(n => n.id === payload.novel.id);
            if (exists) {
              return prev.map(n => n.id === payload.novel.id ? payload.novel : n);
            }
            return [payload.novel, ...prev];
          });
          triggerEventToast(`Truyện mới được thêm: "${payload.novel.title}"`);
        } else if (payload.type === 'novel_updated' && payload.novel) {
          setNovels(prev => prev.map(n => n.id === payload.novel.id ? { ...n, ...payload.novel } : n));
        } else if (payload.type === 'novel_deleted' && payload.id) {
          setNovels(prev => prev.filter(n => n.id !== payload.id));
          triggerEventToast('Đã xóa 1 bộ truyện khỏi thư viện');
        } else if (payload.type === 'chapters_added' && payload.novelId) {
          setNovels(prev =>
            prev.map(n => {
              if (n.id === payload.novelId) {
                const newCount = payload.highestChapterNumber || (n.chaptersCount + (payload.count || 0));
                return { ...n, chaptersCount: Math.max(n.chaptersCount, newCount) };
              }
              return n;
            })
          );
        }
      };

      return () => {
        channel.close();
      };
    } catch {
      // BroadcastChannel not available or restricted
    }
  }, [triggerEventToast]);

  // 3. Connect to Server-Sent Events (SSE) `/api/realtime`
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let retryTimeout: NodeJS.Timeout | null = null;
    let sse: EventSource | null = null;

    const connectSSE = () => {
      try {
        sse = new EventSource('/api/realtime');
        eventSourceRef.current = sse;

        sse.onopen = () => {
          setIsRealtimeConnected(true);
          setRealtimeProvider(prev => prev === 'supabase' ? 'supabase' : 'sse');
        };

        sse.addEventListener('connected', () => {
          setIsRealtimeConnected(true);
        });

        sse.addEventListener('novel:created', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            const novel = (parsed.data || parsed) as Novel;
            if (novel && novel.id) {
              setNovels(prev => {
                const idx = prev.findIndex(n => n.id === novel.id);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = novel;
                  return copy;
                }
                return [novel, ...prev];
              });
              triggerEventToast(`Vừa thêm truyện: "${novel.title}"`);
            }
          } catch {}
        });

        sse.addEventListener('novel:updated', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            const novel = (parsed.data || parsed) as Novel;
            if (novel && novel.id) {
              setNovels(prev => prev.map(n => n.id === novel.id ? { ...n, ...novel } : n));
            }
          } catch {}
        });

        sse.addEventListener('novel:deleted', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            const id = parsed.data?.id || parsed.id;
            if (id) {
              setNovels(prev => prev.filter(n => n.id !== id));
              triggerEventToast('Đã xóa truyện theo thời gian thực');
            }
          } catch {}
        });

        sse.addEventListener('chapters:added', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            const { novelId, count, highestChapterNumber } = parsed.data || parsed;
            if (novelId) {
              setNovels(prev =>
                prev.map(n => {
                  if (n.id === novelId) {
                    const newCount = highestChapterNumber || (n.chaptersCount + (count || 0));
                    return { ...n, chaptersCount: Math.max(n.chaptersCount, newCount) };
                  }
                  return n;
                })
              );
              triggerEventToast(`Đã cào thêm ${count} chương mới`);
            }
          } catch {}
        });

        sse.addEventListener('chapter:updated', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            const chapter = (parsed.data || parsed) as Chapter;
            if (chapter && chapter.novelId) {
              if (chapter.translationStatus === 'translated') {
                setNovels(prev =>
                  prev.map(n => {
                    if (n.id === chapter.novelId) {
                      return {
                        ...n,
                        translatedChaptersCount: Math.min(n.chaptersCount, (n.translatedChaptersCount || 0) + 1),
                      };
                    }
                    return n;
                  })
                );
              }
            }
          } catch {}
        });

        sse.onerror = () => {
          if (sse) sse.close();
          setIsRealtimeConnected(false);
          // Auto reconnect after 4 seconds
          retryTimeout = setTimeout(connectSSE, 4000);
        };
      } catch (err) {
        console.warn('SSE connection attempt error:', err);
        retryTimeout = setTimeout(connectSSE, 5000);
      }
    };

    connectSSE();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      if (sse) sse.close();
    };
  }, [triggerEventToast]);

  // 4. Connect to Supabase Realtime WebSocket if credentials exist
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isCancelled = false;

    async function initSupabaseRealtime() {
      try {
        const res = await fetch('/api/supabase/config');
        const config = await res.json();
        if (isCancelled || !config.configured || !config.url || !config.anonKey) {
          return;
        }

        const supabase = createClient(config.url, config.anonKey, {
          realtime: {
            params: {
              eventsPerSecond: 10,
            },
          },
        });
        supabaseClientRef.current = supabase;

        const channel = supabase
          .channel('schema-db-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'novels' },
            payload => {
              if (payload.eventType === 'INSERT' && payload.new) {
                const novel = supabaseRowToNovel(payload.new);
                setNovels(prev => {
                  if (prev.some(n => n.id === novel.id)) {
                    return prev.map(n => n.id === novel.id ? novel : n);
                  }
                  return [novel, ...prev];
                });
                triggerEventToast(`[Supabase Realtime] Đã thêm: "${novel.title}"`);
              } else if (payload.eventType === 'UPDATE' && payload.new) {
                const novel = supabaseRowToNovel(payload.new);
                setNovels(prev => prev.map(n => n.id === novel.id ? { ...n, ...novel } : n));
              } else if (payload.eventType === 'DELETE' && payload.old) {
                const id = payload.old.id;
                if (id) {
                  setNovels(prev => prev.filter(n => n.id !== id));
                  triggerEventToast('[Supabase Realtime] Đã xóa truyện');
                }
              }
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'chapters' },
            payload => {
              // When chapters change directly in Supabase
              if (payload.eventType === 'INSERT' && payload.new) {
                const nId = payload.new.novel_id;
                setNovels(prev =>
                  prev.map(n => n.id === nId ? { ...n, chaptersCount: n.chaptersCount + 1 } : n)
                );
              } else if (payload.eventType === 'UPDATE' && payload.new) {
                const nId = payload.new.novel_id;
                if (payload.new.translation_status === 'translated') {
                  setNovels(prev =>
                    prev.map(n => n.id === nId ? { ...n, translatedChaptersCount: Math.min(n.chaptersCount, n.translatedChaptersCount + 1) } : n)
                  );
                }
              }
            }
          )
          .subscribe(status => {
            if (status === 'SUBSCRIBED') {
              setIsRealtimeConnected(true);
              setRealtimeProvider('supabase');
            }
          });

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (err) {
        console.warn('Supabase Realtime init error:', err);
      }
    }

    initSupabaseRealtime();

    return () => {
      isCancelled = true;
    };
  }, [triggerEventToast]);

  // Action: Add or update novel in state & broadcast across tabs
  const addOrUpdateNovel = useCallback((novel: Novel) => {
    setNovels(prev => {
      const idx = prev.findIndex(n => n.id === novel.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = novel;
        return copy;
      }
      return [novel, ...prev];
    });

    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'novel_updated',
        novel,
      });
    }
  }, []);

  // Action: Delete novel immediately with optimistic update & server delete
  const deleteNovel = useCallback(async (id: string): Promise<boolean> => {
    // 1. Optimistic removal from UI immediately
    setNovels(prev => prev.filter(n => n.id !== id));
    triggerEventToast('Đã xóa truyện khỏi thư viện');

    // 2. Broadcast across tabs immediately
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'novel_deleted',
        id,
      });
    }

    // 3. Send DELETE to server API (which deletes from Local Storage & Supabase and emits realtime events)
    try {
      const res = await fetch(`/api/novels/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }, [triggerEventToast]);

  return {
    novels,
    setNovels,
    isLoading,
    isRealtimeConnected,
    realtimeProvider,
    lastEvent,
    refreshNovels,
    deleteNovel,
    addOrUpdateNovel,
  };
}
