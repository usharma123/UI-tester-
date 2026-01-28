/**
 * Update cache management for 24-hour TTL caching
 */

import { promises as fs } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { UpdateCache } from "./types.js";

const CACHE_DIR = join(homedir(), ".ui-qa");
const CACHE_FILE = join(CACHE_DIR, "update-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Ensure the cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // Ignore errors - cache is best-effort
  }
}

/**
 * Read the cached update info if it exists and is not expired
 */
export async function readCache(): Promise<UpdateCache | null> {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    const cache: UpdateCache = JSON.parse(data);

    // Check if cache is expired
    const now = Date.now();
    if (now - cache.checkedAt > CACHE_TTL_MS) {
      return null; // Cache expired
    }

    return cache;
  } catch {
    return null; // No cache or invalid cache
  }
}

/**
 * Write update info to cache
 */
export async function writeCache(cache: UpdateCache): Promise<void> {
  try {
    await ensureCacheDir();
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch {
    // Ignore errors - cache is best-effort
  }
}

/**
 * Check if we should fetch from npm (cache miss or expired)
 */
export async function shouldFetchFromNpm(
  currentVersion: string
): Promise<{ shouldFetch: boolean; cachedVersion?: string }> {
  const cache = await readCache();

  if (!cache) {
    return { shouldFetch: true };
  }

  // If current version changed, refetch
  if (cache.currentVersion !== currentVersion) {
    return { shouldFetch: true };
  }

  return { shouldFetch: false, cachedVersion: cache.latestVersion };
}
