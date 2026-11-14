import { errorResponse } from './utils';

/**
 * Browser-facing write APIs accept same-origin requests only.
 * Comparing with request.url works for production custom domains and Workers previews.
 */
export function validateOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return errorResponse('Missing request origin', 403, 'INVALID_ORIGIN');

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return errorResponse('Invalid request URL', 400, 'INVALID_ORIGIN');
  }

  if (origin !== requestOrigin) return errorResponse('Invalid origin', 403, 'INVALID_ORIGIN');
  return null;
}
