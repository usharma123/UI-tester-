export function truncateText(value: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (value.length <= maxWidth) return value;
  if (maxWidth <= 3) return ".".repeat(maxWidth);
  return `${value.slice(0, maxWidth - 3)}...`;
}
