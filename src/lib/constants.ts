export const ACTIVE_RESERVATION_STATES = [
  'HELD',
  'PENDING_VERIFICATION',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
] as const;

export type Locale = 'en' | 'hi';

export const LANGUAGE_ROUTES = {
  en: '/en/',
  hi: '/hi/',
} as const;

export const SETUP_REQUIRED = 'SETUP_REQUIRED';
