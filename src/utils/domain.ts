const MULTI_PART_TLDS = new Set([
  "co",
  "com",
  "org",
  "net",
  "gov",
  "edu",
  "ac",
]);

export function getApexDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");

  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];
  const thirdLast = parts[parts.length - 3];

  if (last.length === 2 && MULTI_PART_TLDS.has(secondLast)) {
    return [thirdLast, secondLast, last].join(".");
  }

  return [secondLast, last].join(".");
}

export function getApexDomainFromUrl(url: string, baseUrl?: string): string | undefined {
  try {
    const parsed = new URL(url, baseUrl);
    return getApexDomain(parsed.hostname);
  } catch {
    return undefined;
  }
}

export function isSameApexDomain(url: string, baseDomain: string, baseUrl?: string): boolean {
  const target = getApexDomainFromUrl(url, baseUrl);
  if (!target) return false;
  return target === baseDomain;
}
