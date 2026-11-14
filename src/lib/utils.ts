import crypto from 'node:crypto';

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: status < 400, data }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function errorResponse(message: string, status = 400, code = 'BAD_REQUEST'): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    }
  );
}

export function normalizePhoneIndian(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  throw new Error('Enter a valid 10-digit Indian mobile number');
}

export { normalizeVehicleRegistration } from './vehicle-registration';

export function inrFromPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function generateBookingCode(): string {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `HSR-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${suffix}`;
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function normalizeUtr(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}
