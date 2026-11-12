import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: {
      enabled: true,
    },
  }),
  output: 'server',
  integrations: [react()],
  site: 'https://SETUP_REQUIRED.example',
  trailingSlash: 'always',
});
