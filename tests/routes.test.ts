import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = '/home/runner/work/HSR/HSR/src/pages';

describe('bilingual route structure', () => {
  it('contains required english and hindi pages', () => {
    const required = [
      'index.astro',
      'services.astro',
      'how-it-works.astro',
      'check-expiry.astro',
      'book.astro',
      'contact.astro',
      'about.astro',
    ];

    for (const file of required) {
      expect(fs.existsSync(path.join(root, 'en', file))).toBe(true);
      expect(fs.existsSync(path.join(root, 'hi', file))).toBe(true);
    }
  });
});
