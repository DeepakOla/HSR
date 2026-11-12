export async function readApiJson<T = unknown>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();

  if (mediaType !== 'application/json' && !mediaType.endsWith('+json')) {
    const path = response.url ? new URL(response.url).pathname : 'API endpoint';
    throw new Error(
      `Expected JSON from ${path}, but received ${mediaType || 'no content type'} (HTTP ${response.status}).`
    );
  }

  return await response.json() as T;
}
