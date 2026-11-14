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

export interface RemainingValidityResult {
  daysRemaining: number;
  status: 'VALID' | 'EXPIRING_SOON' | 'OVERDUE';
  timeRemainingFormatted: string;
  statusLabel: string;
}

export function calculateRemainingValidity(
  nextDueDate: string,
  today: string = todayInIndia(),
  locale: 'en' | 'hi' = 'en'
): RemainingValidityResult {
  if (!isValidIsoDate(nextDueDate)) {
    throw new Error('Enter a valid due date in YYYY-MM-DD format');
  }

  const [ny, nm, nd] = nextDueDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);

  const dueDate = new Date(Date.UTC(ny, nm - 1, nd));
  const currDate = new Date(Date.UTC(ty, tm - 1, td));

  const diffTime = dueDate.getTime() - currDate.getTime();
  const daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    const months = Math.floor(overdueDays / 30);
    const label = locale === 'hi' ? 'अवधि समाप्त (ओवरड्यू)' : 'Testing Overdue';
    const timeFormatted = months >= 1
      ? (locale === 'hi' ? `${months} महीने पहले समाप्त` : `Overdue by ${months} month${months > 1 ? 's' : ''}`)
      : (locale === 'hi' ? `${overdueDays} दिन पहले समाप्त` : `Overdue by ${overdueDays} day${overdueDays > 1 ? 's' : ''}`);
    return {
      daysRemaining,
      status: 'OVERDUE',
      timeRemainingFormatted: timeFormatted,
      statusLabel: label,
    };
  }

  // Positive remaining days
  const status = daysRemaining <= 60 ? 'EXPIRING_SOON' : 'VALID';
  const statusLabel = status === 'EXPIRING_SOON'
    ? (locale === 'hi' ? 'जल्द समाप्त होने वाला है' : 'Expiring Soon')
    : (locale === 'hi' ? 'वैध (सुरक्षित)' : 'Testing Not Due (Valid)');

  const years = Math.floor(daysRemaining / 365);
  const remainingAfterYears = daysRemaining % 365;
  const months = Math.floor(remainingAfterYears / 30);

  let timeFormatted = '';
  if (years > 0) {
    if (months > 0) {
      timeFormatted = locale === 'hi'
        ? `${years} वर्ष, ${months} महीने शेष`
        : `${years} year${years > 1 ? 's' : ''}, ${months} month${months > 1 ? 's' : ''} remaining`;
    } else {
      timeFormatted = locale === 'hi'
        ? `${years} वर्ष शेष`
        : `${years} year${years > 1 ? 's' : ''} remaining`;
    }
  } else if (months > 0) {
    timeFormatted = locale === 'hi'
      ? `${months} महीने शेष`
      : `${months} month${months > 1 ? 's' : ''} remaining`;
  } else {
    timeFormatted = locale === 'hi'
      ? `${daysRemaining} दिन शेष`
      : `${daysRemaining} day${daysRemaining > 1 ? 's' : ''} remaining`;
  }

  return {
    daysRemaining,
    status,
    timeRemainingFormatted: timeFormatted,
    statusLabel,
  };
}
