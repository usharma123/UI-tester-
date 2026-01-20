import { createAgentBrowser, type AgentBrowser, type AgentBrowserOptions } from "../agentBrowser.js";

export interface PooledBrowser {
  browser: AgentBrowser;
  id: number;
}

export interface BrowserPool {
  acquire(): Promise<PooledBrowser>;
  release(id: number): void;
  closeAll(): Promise<void>;
  getActiveCount(): number;
}

interface PoolEntry {
  browser: AgentBrowser;
  inUse: boolean;
}

/**
 * Creates a pool of browser instances for parallel page testing.
 * Browsers are created lazily on first acquire and reused across pages.
 */
export function createBrowserPool(
  size: number,
  options: AgentBrowserOptions
): BrowserPool {
  const pool: Map<number, PoolEntry> = new Map();
  const waitingQueue: Array<(entry: PooledBrowser) => void> = [];
  let nextId = 0;

  async function createBrowserEntry(): Promise<{ id: number; entry: PoolEntry }> {
    const id = nextId++;
    const browser = createAgentBrowser(options);
    const entry: PoolEntry = { browser, inUse: true };
    pool.set(id, entry);
    return { id, entry };
  }

  function findAvailableBrowser(): { id: number; entry: PoolEntry } | null {
    for (const [id, entry] of pool.entries()) {
      if (!entry.inUse) {
        return { id, entry };
      }
    }
    return null;
  }

  return {
    async acquire(): Promise<PooledBrowser> {
      // First, try to find an available browser in the pool
      const available = findAvailableBrowser();
      if (available) {
        available.entry.inUse = true;
        return { browser: available.entry.browser, id: available.id };
      }

      // If pool isn't full, create a new browser
      if (pool.size < size) {
        const { id, entry } = await createBrowserEntry();
        return { browser: entry.browser, id };
      }

      // Pool is full and all browsers are in use - wait for one to be released
      return new Promise((resolve) => {
        waitingQueue.push(resolve);
      });
    },

    release(id: number): void {
      const entry = pool.get(id);
      if (!entry) return;

      // If there's a waiting request, give the browser to it directly
      if (waitingQueue.length > 0) {
        const waiting = waitingQueue.shift()!;
        waiting({ browser: entry.browser, id });
        return;
      }

      // Otherwise, mark as available
      entry.inUse = false;
    },

    async closeAll(): Promise<void> {
      const closePromises: Promise<void>[] = [];

      for (const [id, entry] of pool.entries()) {
        closePromises.push(
          entry.browser.close().catch(() => {
            // Ignore close errors
          })
        );
      }

      await Promise.all(closePromises);
      pool.clear();
    },

    getActiveCount(): number {
      let count = 0;
      for (const entry of pool.values()) {
        if (entry.inUse) count++;
      }
      return count;
    },
  };
}
