import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.gadgetsbidding.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
