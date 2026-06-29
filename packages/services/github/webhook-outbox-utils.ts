const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 15 * 60_000;

export function computeNextRetryDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_MS);
}

export function computeNextRetryAt(attempts: number): Date {
  return new Date(Date.now() + computeNextRetryDelayMs(attempts));
}
