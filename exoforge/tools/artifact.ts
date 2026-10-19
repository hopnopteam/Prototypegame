// npm run artifact: turns the single-file build into the page published as the owner's play link. The Artifact
// host wraps the page in its own document, so the outer html/head/body tags come off; everything else is inline.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
const page = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body>\s*/gi, '')
  .replace(/<\/html>\s*/i, '')
  .replace('<title>EXOFORGE</title>', '<title>EXOFORGE: Scrap to Sky</title>');
// The title must sit in the first 8 KB, before the inlined script.
const title = page.indexOf('<title>');
if (title < 0 || title > 8000) throw new Error('The page title must come first');
writeFileSync(join(root, 'dist/exoforge.html'), page);
console.log(`artifact: dist/exoforge.html (${(page.length / 1e6).toFixed(2)} MB)`);
