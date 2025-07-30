// Simple in-memory cache for development
// In production, replace with Upstash Redis

interface CacheItem {
  data: any;
  timestamp: number;
}

class SimpleCache {
  private cache: Map<string, CacheItem> = new Map();

  async get(key: string): Promise<any | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    
    return item.data;
  }

  async setex(key: string, ttl: number, data: any): Promise<void> {
    this.cache.set(key, {
      data,
      timestamp: Date.now() + (ttl * 1000)
    });
    
    // Clean up expired items
    setTimeout(() => {
      this.cache.delete(key);
    }, ttl * 1000);
  }
}

export const cache = new SimpleCache();