import fs from 'fs';
import type { CacheEntry, CacheStore, TreeNode } from './types.js';
import { CACHE_FILE } from './config.js';

function loadCacheFromFile(): CacheStore {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const contents = fs.readFileSync(CACHE_FILE, "utf8");
            if (!contents.trim()) return {};
            return JSON.parse(contents) as CacheStore;
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Cache file corrupted, resetting:", message);
        try { fs.unlinkSync(CACHE_FILE); } catch {}
    }

    return {};
}

let cache: CacheStore = loadCacheFromFile();

export function getCache(): CacheStore {
    return cache;
}

export function getCacheEntry(key: string): CacheEntry | undefined {
    try {
        const cacheEntry: CacheEntry | undefined = cache[key];
        if (cacheEntry) return cacheEntry;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Cache entry not found:", message);

        return undefined;
    }
}

export function setCacheEntry(key: string, data: TreeNode[]): void {
    try {
        cache[key] = {
            data,
            lastUpdated: Date.now()
        };

        saveCacheToFile();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Unable to update cache entry:", message);
    }
}

export function deleteCacheEntry(key: string): boolean {
    try {
        delete cache[key];
        saveCacheToFile();
        return true;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Unable to delete cache entry:", message);
        return false;
    }
}

export function clearCache(): void {
    cache = {};
    saveCacheToFile();
}

function saveCacheToFile() {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}