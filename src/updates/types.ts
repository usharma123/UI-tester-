/**
 * Types for auto-update checking functionality
 */

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateCommand: string;
}

export interface UpdateCache {
  latestVersion: string;
  checkedAt: number; // Unix timestamp
  currentVersion: string;
}

export interface UpdateCheckResult {
  updateInfo: UpdateInfo | null;
  fromCache: boolean;
  error?: string;
}
