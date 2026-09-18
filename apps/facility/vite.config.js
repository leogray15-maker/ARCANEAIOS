import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The facility never carries its own copy of the roster. `@arcane/config`
// resolves through the npm workspace symlink, the same way Node resolves it
// for the tests, so there is exactly one resolution path.
const env = (...names) => { for (const n of names) if (process.env[n]) return process.env[n]; return ''; };

export default defineConfig({
  // Only the Supabase URL and anon key are injected — by exact name, so a
  // service-role key can never be swept into the bundle by a prefix rule.
  define: {
    // The Vercel integration prefixes its variables with the storage name (`storage_`); plain names work too.
    __SUPABASE_URL__: JSON.stringify(env('NEXT_PUBLIC_storage_SUPABASE_URL', 'storage_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL')),
    __SUPABASE_ANON__: JSON.stringify(env('NEXT_PUBLIC_storage_SUPABASE_PUBLISHABLE_KEY', 'storage_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_storage_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY')),
  },
  // /api is served by tools/dev-api.mjs (npm run api) on 8787, the same functions Vercel runs from api/.
  server: { fs: { allow: [path.resolve(here, '../..')] }, proxy: { '/api': { target: `http://127.0.0.1:${process.env.ARCANE_API_PORT || 8787}`, changeOrigin: false } } },
  build: { target: 'es2022', sourcemap: true, rollupOptions: { input: { main: path.resolve(here, 'index.html'), sheet: path.resolve(here, 'sheet.html') } } },
});
