export function calculateNextRetestDate(lastPeriodicTestDate: string): string {
  const [y, m, d] = lastPeriodicTestDate.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const next = new Date(Date.UTC(base.getUTCFullYear() + 3, base.getUTCMonth(), base.getUTCDate()));
  return next.toISOString().slice(0, 10);
}
