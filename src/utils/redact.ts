const PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
  ssn: /\d{3}[-.\s]?\d{2}[-.\s]?\d{4}/g,
  creditCard: /\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}/g,
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

const REPLACEMENTS = {
  email: "[EMAIL_REDACTED]",
  phone: "[PHONE_REDACTED]",
  ssn: "[SSN_REDACTED]",
  creditCard: "[CC_REDACTED]",
  ipAddress: "[IP_REDACTED]",
};

export function redactSensitiveData(text: string): string {
  let result = text;

  for (const [key, pattern] of Object.entries(PATTERNS)) {
    const replacement = REPLACEMENTS[key as keyof typeof REPLACEMENTS];
    result = result.replace(pattern, replacement);
  }

  return result;
}

export function redactSnapshot(snapshot: string): string {
  return redactSensitiveData(snapshot);
}

export function truncateSnapshot(snapshot: string, maxLength: number = 50000): string {
  if (snapshot.length <= maxLength) {
    return snapshot;
  }

  const preserved = snapshot.slice(0, maxLength);
  const truncatedCount = snapshot.length - maxLength;

  return `${preserved}\n\n[TRUNCATED: ${truncatedCount} characters omitted]`;
}
