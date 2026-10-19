import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatChunkJson } from './src/sim/chunkFormat';

// Lets the chunk editor save straight into src/content/chunks while the dev server runs.
function chunkSaver(): Plugin {
  return {
    name: 'exoforge-chunk-saver',
    configureServer(server) {
      server.middlewares.use('/__chunks/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (part) => { body += part; });
        req.on('end', () => {
          try {
            const chunk = JSON.parse(body) as { id?: unknown };
            if (typeof chunk.id !== 'string' || !/^w\d+_\d+$/.test(chunk.id)) throw new Error('bad chunk id');
            const file = resolve(__dirname, 'src/content/chunks', `${chunk.id}.json`);
            writeFileSync(file, formatChunkJson(chunk));
            res.end(JSON.stringify({ ok: true, file }));
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [chunkSaver(), viteSingleFile()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
  },
  server: { host: true },
});
