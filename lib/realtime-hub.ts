import { Novel, Chapter } from '@/types/novel';

export type RealtimeEventName = 
  | 'novel:created' 
  | 'novel:updated' 
  | 'novel:deleted' 
  | 'chapter:created'
  | 'chapter:updated' 
  | 'chapters:added' 
  | 'ping';

export interface RealtimePayload<T = unknown> {
  event: RealtimeEventName;
  timestamp: string;
  data: T;
}

class RealtimeHub {
  private clients: Set<ReadableStreamDefaultController> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) return;
    // Send heartbeat every 15 seconds to prevent connection drops across proxies/Cloud Run
    this.heartbeatInterval = setInterval(() => {
      this.broadcast('ping', { time: Date.now() });
    }, 15000);
  }

  /**
   * Register a new SSE subscriber controller
   */
  public subscribe(controller: ReadableStreamDefaultController): () => void {
    this.clients.add(controller);

    // Send immediate welcome ping
    try {
      const initMessage = `event: connected\ndata: ${JSON.stringify({ 
        connected: true, 
        timestamp: new Date().toISOString(),
        clientsCount: this.clients.size 
      })}\n\n`;
      controller.enqueue(new TextEncoder().encode(initMessage));
    } catch {
      this.clients.delete(controller);
    }

    return () => {
      this.clients.delete(controller);
    };
  }

  /**
   * Broadcast an event to all connected SSE clients
   */
  public broadcast<T = unknown>(event: RealtimeEventName, data: T) {
    const payload: RealtimePayload<T> = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const sseMessage = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    const encoded = new TextEncoder().encode(sseMessage);

    const deadClients: ReadableStreamDefaultController[] = [];

    for (const client of this.clients) {
      try {
        client.enqueue(encoded);
      } catch {
        deadClients.push(client);
      }
    }

    for (const dead of deadClients) {
      this.clients.delete(dead);
    }
  }

  // Domain-specific notification helpers
  public notifyNovelCreated(novel: Novel) {
    this.broadcast('novel:created', novel);
  }

  public notifyNovelUpdated(novel: Novel) {
    this.broadcast('novel:updated', novel);
  }

  public notifyNovelDeleted(novelId: string) {
    this.broadcast('novel:deleted', { id: novelId });
  }

  public notifyChaptersAdded(novelId: string, count: number, highestChapterNumber?: number) {
    this.broadcast('chapters:added', { novelId, count, highestChapterNumber });
  }

  public notifyChapterUpdated(chapter: Chapter) {
    this.broadcast('chapter:updated', chapter);
  }

  public getSubscriberCount(): number {
    return this.clients.size;
  }
}

// Global singleton instance for Next.js hot reload safety
const globalForRealtime = global as unknown as { realtimeHub?: RealtimeHub };
export const realtimeHub = globalForRealtime.realtimeHub || new RealtimeHub();
if (process.env.NODE_ENV !== 'production') {
  globalForRealtime.realtimeHub = realtimeHub;
}
