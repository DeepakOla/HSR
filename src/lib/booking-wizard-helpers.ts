import type { Locale } from './constants';

export interface VehicleOption {
  value: string;
  labelEn: string;
  labelHi: string;
}

export interface CylinderOption {
  value: string;
  count: number | null;
  labelEn: string;
  labelHi: string;
}

export const VEHICLE_OPTIONS: readonly VehicleOption[] = [
  { value: 'Car', labelEn: 'Car (Passenger)', labelHi: 'कार / Car (यात्री वाहन)' },
  { value: 'Taxi', labelEn: 'Taxi / Cab', labelHi: 'टैक्सी / Taxi' },
  { value: 'Tempo', labelEn: 'Tempo / Three-Wheeler', labelHi: 'टेम्पो / Tempo' },
  { value: 'Van', labelEn: 'Van / Omni / Eeco', labelHi: 'वैन / Van' },
  { value: 'LCV', labelEn: 'LCV (Light Commercial Vehicle)', labelHi: 'एलसीवी / LCV (हल्का वाणिज्यिक वाहन)' },
  { value: 'Truck', labelEn: 'Truck (Commercial / Heavy)', labelHi: 'ट्रक / Truck (वाणिज्यिक / भारी)' },
  { value: 'Bus', labelEn: 'Bus / Mini-bus', labelHi: 'बस / Bus' },
  { value: 'Other', labelEn: 'Other vehicle type', labelHi: 'अन्य वाहन प्रकार (Other)' },
] as const;

export const PUBLIC_CYLINDER_OPTIONS: readonly CylinderOption[] = [
  { value: '1', count: 1, labelEn: '1 cylinder', labelHi: '1 सिलेंडर' },
  { value: '2', count: 2, labelEn: '2 cylinders', labelHi: '2 सिलेंडर' },
  { value: '3', count: 3, labelEn: '3 cylinders', labelHi: '3 सिलेंडर' },
  { value: '4', count: 4, labelEn: '4 cylinders', labelHi: '4 सिलेंडर' },
  { value: '5', count: 5, labelEn: '5 cylinders', labelHi: '5 सिलेंडर' },
  { value: '6', count: 6, labelEn: '6 cylinders', labelHi: '6 सिलेंडर' },
  { value: 'more', count: null, labelEn: 'More than 6 cylinders (Contact Centre)', labelHi: '6 से अधिक सिलेंडर (केंद्र से संपर्क करें)' },
] as const;

export const DEFAULT_CONTACT_PHONE = '+919910055355';
export const DEFAULT_CONTACT_WHATSAPP = '+919910055355';
export const DEFAULT_WHATSAPP_URL = 'https://wa.me/919910055355';

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Kolkata timezone.
 */
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

/**
 * Adds N calendar days to a YYYY-MM-DD date string using UTC arithmetic.
 */
export function addDays(value: string, days: number): string {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Formats paise into Indian Rupee currency string, e.g. 50000 -> ₹500.00
 */
export function inr(paise: number | null): string {
  if (paise == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/**
 * Returns localized month and year title for a calendar view.
 */
export function monthTitle(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Localizes hour strings (e.g. "06", "13") to natural English and Hindi formats.
 * Example: "06" -> "6 AM" (en), "सुबह 6 बजे (6 AM)" (hi)
 */
export function formatHourOption(hourStr: string, locale: Locale): string {
  const hour = parseInt(hourStr, 10);
  if (isNaN(hour)) return hourStr;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? 'AM' : 'PM';
  if (locale === 'hi') {
    const period = hour < 12 ? 'सुबह' : hour < 16 ? 'दोपहर' : 'शाम';
    return `${period} ${displayHour} बजे (${displayHour} ${ampm})`;
  }
  return `${displayHour} ${ampm}`;
}

/**
 * Calculates duration in minutes between two "HH:MM" timestamps.
 */
export function calculateDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

/**
 * Formats vehicle description combining class and model defensively.
 */
export function buildVehicleDescription(vehicleClass: string, vehicleModel: string): string {
  const trimmedClass = vehicleClass.trim() || 'Car';
  const trimmedModel = vehicleModel.trim();
  if (trimmedClass === 'Other') {
    return trimmedModel || 'Other';
  }
  return trimmedModel ? `${trimmedClass} - ${trimmedModel}` : trimmedClass;
}
