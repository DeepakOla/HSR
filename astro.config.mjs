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
  session: false,
  output: 'server',
  integrations: [react()],
  trailingSlash: 'always',
  redirects: {
    '/Searchcng': '/directory/',
    '/search-cng': '/directory/',
    '/searchCNG': '/directory/',
    '/HSR/CNG/CylinderTest': '/cng/cylinder-test/',
    '/hsr/cng/cylinder-test': '/cng/cylinder-test/',
    '/HSR/CNG/Cylinder-Test': '/cng/cylinder-test/',
    '/admin/login': '/login/?role=staff',
    '/customer': '/app/',
    '/portal': '/login/',
  },
});
