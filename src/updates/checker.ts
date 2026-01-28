/**
 * Update checker - fetches latest version from npm registry
 */

import type { UpdateInfo, UpdateCheckResult } from "./types.js";
import { readCache, writeCache, shouldFetchFromNpm } from "./cache.js";

const PACKAGE_NAME = "@usharma124/ui-qa";
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}`;
const FETCH_TIMEOUT_MS = 3000; // 3 second timeout

/**
 * Compare semver versions
 * Returns true if latest > current
 */
function isNewerVersion(current: string, latest: string): boolean {
  const parseVersion = (v: string) => {
    const parts = v.replace(/^v/, "").split(".");
    return parts.map((p) => parseInt(p, 10) || 0);
  };

  const currentParts = parseVersion(current);
  const latestParts = parseVersion(latest);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const curr = currentParts[i] || 0;
    const lat = latestParts[i] || 0;
    if (lat > curr) return true;
    if (lat < curr) return false;
  }

  return false;
}

/**
 * Fetch latest version from npm registry with timeout
 */
async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(NPM_REGISTRY_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { "dist-tags"?: { latest?: string } };
    return data["dist-tags"]?.latest || null;
  } catch {
    return null; // Network error, timeout, or abort
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Create UpdateInfo object
 */
function createUpdateInfo(
  currentVersion: string,
  latestVersion: string
): UpdateInfo {
  const updateAvailable = isNewerVersion(currentVersion, latestVersion);
  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    updateCommand: `npm update -g ${PACKAGE_NAME}`,
  };
}

/**
 * Check for updates - main entry point
 * Returns null on any error (fail silently)
 */
export async function checkForUpdates(
  currentVersion: string
): Promise<UpdateCheckResult> {
  try {
    // Check if we should fetch from npm or use cache
    const { shouldFetch, cachedVersion } =
      await shouldFetchFromNpm(currentVersion);

    if (!shouldFetch && cachedVersion) {
      // Use cached version
      const updateInfo = createUpdateInfo(currentVersion, cachedVersion);
      return {
        updateInfo: updateInfo.updateAvailable ? updateInfo : null,
        fromCache: true,
      };
    }

    // Fetch from npm
    const latestVersion = await fetchLatestVersion();

    if (!latestVersion) {
      // Network error - try to use cache even if expired
      const cache = await readCache();
      if (cache) {
        const updateInfo = createUpdateInfo(currentVersion, cache.latestVersion);
        return {
          updateInfo: updateInfo.updateAvailable ? updateInfo : null,
          fromCache: true,
        };
      }
      return { updateInfo: null, fromCache: false };
    }

    // Cache the result
    await writeCache({
      latestVersion,
      checkedAt: Date.now(),
      currentVersion,
    });

    const updateInfo = createUpdateInfo(currentVersion, latestVersion);
    return {
      updateInfo: updateInfo.updateAvailable ? updateInfo : null,
      fromCache: false,
    };
  } catch {
    // Fail silently - update check should never break the CLI
    return { updateInfo: null, fromCache: false };
  }
}
