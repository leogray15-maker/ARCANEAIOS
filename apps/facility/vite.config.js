import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The facility never carries its own copy of the roster. `@arcane/config`
// resolves through the npm workspace symlink, the same way Node resolves it
// for the tests, so there is exactly one resolution path.
export default defineConfig({
  server: { fs: { allow: [path.resolve(here, '../..')] } },
  build: { target: 'es2022', sourcemap: true, rollupOptions: { input: { main: path.resolve(here, 'index.html'), sheet: path.resolve(here, 'sheet.html') } } },
});
