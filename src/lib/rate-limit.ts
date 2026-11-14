const bucket = new Map<string, { count: number; resetAt: number }>();

export function limitKey(request: Request, suffix: string) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  return `${suffix}:${ip}`;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = bucket.get(key);
  if (!current || current.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
