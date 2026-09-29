// Builds the game into self-contained HTML: dist/index.html (full page, playable offline from disk) and
// dist/night-express.html (a body fragment for publishing as an Artifact, which adds its own skeleton).
import { build, context } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const entry = process.env.ENTRY ?? 'src/main.ts';

const options = {
  entryPoints: [resolve(root, entry)],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  minify: !watch,
  sourcemap: false,
  write: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
  // Sound samples ride inside the one HTML file.
  loader: { '.mp3': 'base64' },
};

function emit(result) {
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = readFileSync(resolve(root, 'src/ui/styles.css'), 'utf8');
  const body = readFileSync(resolve(root, 'src/ui/body.html'), 'utf8');
  // Jost (a Futura-style geometric sans, OFL) is embedded so the game looks the same offline and on
  // first paint, with no font request at all.
  const jost = readFileSync(resolve(root, 'node_modules/@fontsource-variable/jost/files/jost-latin-wght-normal.woff2')).toString('base64');
  const fontFace = `@font-face { font-family: 'Jost'; font-style: normal; font-weight: 100 900; font-display: block; src: url(data:font/woff2;base64,${jost}) format('woff2'); }`;
  const head = `<title>Night Express</title>\n<style>\n${fontFace}\n${css}\n</style>\n`;
  const script = `<script>\n${js}\n</script>\n`;
  // The Artifact skeleton already pads :root by the safe-area insets, so the fragment must not add them again.
  const artifactFit = '<style>:root { --safe-top: 0px; --safe-bottom: 0px; } html { box-sizing: border-box; }</style>\n';
  const fragment = `${head}${artifactFit}${body}\n${script}`;
  const page =
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n' +
    '<meta name="theme-color" content="#1C2740">\n' +
    `${head}</head>\n<body>\n${body}\n${script}</body>\n</html>\n`;
  mkdirSync(resolve(root, 'dist'), { recursive: true });
  // OUT=preview.html writes a single full page (used with ENTRY=src/preview.ts for art iteration).
  if (process.env.OUT) {
    writeFileSync(resolve(root, 'dist', process.env.OUT), page);
    console.log(`Built dist/${process.env.OUT}`);
    return;
  }
  writeFileSync(resolve(root, 'dist/index.html'), page);
  writeFileSync(resolve(root, 'dist/night-express.html'), fragment);
  const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
  console.log(`Built dist/index.html and dist/night-express.html (${kb} KB)`);
}

if (watch) {
  const ctx = await context({ ...options, plugins: [{ name: 'emit', setup: (b) => b.onEnd((r) => r.errors.length === 0 && emit(r)) }] });
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  emit(await build(options));
}
