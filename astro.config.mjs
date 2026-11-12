import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
  adapter: cloudflare({
    imageService: 'compile',
    session: false,
    platformProxy: {
      enabled: true,
    },
  }),
  output: 'server',
  integrations: [react()],
  trailingSlash: 'always',
});
