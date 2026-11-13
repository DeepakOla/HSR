import { describe, expect, it } from 'vitest';
import { readApiJson } from '../src/lib/client-api';

describe('readApiJson', () => {
  it('parses a JSON response', async () => {
    const response = new Response(JSON.stringify({ data: { ok: true } }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });

    await expect(readApiJson(response)).resolves.toEqual({ data: { ok: true } });
  });

  it('explains when an API route returns HTML instead of JSON', async () => {
    const response = new Response('<!doctype html>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    await expect(readApiJson(response)).rejects.toThrow(
      'Expected JSON from API endpoint, but received text/html (HTTP 404).'
    );
  });
});
