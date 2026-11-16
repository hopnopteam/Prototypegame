import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Session 49: baked models and detail textures are inlined as base64 by the build (scripts/build.mjs); tests load
  // them the same way.
  plugins: [
    {
      name: 'base64-assets',
      load(id: string) {
        if (/\.(bin|jpg)$/.test(id)) return `export default ${JSON.stringify(readFileSync(id).toString('base64'))};`;
        return null;
      },
    },
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
