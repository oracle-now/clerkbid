/**
 * URL safety helper for posting destinations.
 * Permits only absolute http:// and https:// URLs.
 * Rejects javascript:, data:, file:, relative paths, malformed URLs, and blank.
 */
export function isValidPostingDestination(value: string | undefined | null): boolean {
  if (!value || value.trim() === "") return false;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Open a destination URL safely. Only call with a value that has passed
 * isValidPostingDestination — this guard is belt-and-suspenders.
 */
export function openPostingDestination(value: string): void {
  if (!isValidPostingDestination(value)) return;
  window.open(value.trim(), "_blank", "noopener,noreferrer");
}
