export type SyncSource = "deel" | "ibkr" | "wise";

export const SYNC_LABELS: Record<SyncSource, string> = {
  deel: "Deel sąskaitos (naršyklės priedas)",
  ibkr: "Interactive Brokers",
  wise: "Wise (CSV ataskaita)",
};

const DAY = 86_400_000;

/** "niekada", "šiandien", "prieš 3 d." plus the date; `now` is passed in. */
export function lastSyncLabel(iso: string | undefined, now: Date): string {
  if (!iso) return "niekada";
  const days = Math.floor((now.getTime() - Date.parse(iso)) / DAY);
  const date = iso.slice(0, 10);
  if (days <= 0) return `šiandien (${date})`;
  return `prieš ${days} d. (${date})`;
}

/** True when the source was never synced or the last sync is older than `maxDays`. */
export function isStale(iso: string | undefined, now: Date, maxDays: number): boolean {
  return !iso || (now.getTime() - Date.parse(iso)) / DAY > maxDays;
}
