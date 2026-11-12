export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function calculateNextRetestDate(lastPeriodicTestDate: string): string {
  if (!isValidIsoDate(lastPeriodicTestDate)) {
    throw new Error('Enter a valid calendar date in YYYY-MM-DD format');
  }
  const [y, m, d] = lastPeriodicTestDate.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const next = new Date(Date.UTC(base.getUTCFullYear() + 3, base.getUTCMonth(), base.getUTCDate()));
  return next.toISOString().slice(0, 10);
}
