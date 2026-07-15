import type { FirmStatus } from "./firm";

export const STATUS_LABEL: Record<FirmStatus, string> = {
  pending: "pending",
  researched: "send-ready",
  drafted: "drafted",
  sent: "sent",
  no_email_found: "no email",
  phone_first: "phone-first",
  no_website_found: "no website",
};

/** CSS class suffix for the status badge colour. */
export function statusClass(status: FirmStatus): string {
  switch (status) {
    case "researched":
    case "sent":
      return "st-green";
    case "drafted":
      return "st-blue";
    case "phone_first":
      return "st-amber";
    case "no_website_found":
    case "no_email_found":
      return "st-red";
    default:
      return "st-muted";
  }
}

/**
 * Run `worker` over `items` with at most `limit` concurrent invocations.
 * `onDone` fires after each item settles (success or failure) so the UI can
 * update live progress.
 */
export async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  onDone?: () => void,
): Promise<void> {
  let i = 0;
  async function runner() {
    while (i < items.length) {
      const idx = i++;
      try {
        await worker(items[idx]);
      } catch {
        // Worker is responsible for its own error handling; keep the pool alive.
      }
      onDone?.();
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, runner);
  await Promise.all(runners);
}
