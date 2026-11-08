// Builds the playable ad into one self-contained HTML file: playable/night-express-playable.html.
// The ad network and the store links are one block at the very top of that file (NX_AD); see playable/README.md.
// Usage: node scripts/build-playable.mjs [network]   (network: unity | applovin | meta | google; default unity)
//        NO_TUTORIAL=1 node scripts/build-playable.mjs [network]   (the no-tutorial variant: playable/night-express-playable-no-tutorial.html)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const network = process.argv[2] ?? 'unity';
const noTutorial = process.env.NO_TUTORIAL === '1';
// Each network's build gets its own file name (night-express-playable-applovin.html…); unity keeps the plain name.
const suffix = network === 'unity' ? '' : `-${network}`;
const fileName = `night-express-playable${noTutorial ? '-no-tutorial' : ''}${suffix}.html`;
// The store listing Install and Play Now open (no App Store page yet: iPhones get the Play listing too).
const ANDROID_URL = 'https://play.google.com/store/apps/details?id=io.heseri.night&hl=en_CA';
const IOS_URL = '';
const google = network === 'google';

// The game's theme music is switched off (config/audio.ts) but its MP3 is imported by the audio engine: leave it out.
const noMusic = {
  name: 'no-music',
  setup(b) {
    b.onResolve({ filter: /\/music$/ }, (args) => (args.importer.includes('/audio/') ? { path: 'music-stub', namespace: 'nx' } : undefined));
    // Wider room doorways in the ad (easier in and out with a finger); the game itself is unchanged.
    b.onLoad({ filter: /src\/world\/layout\.ts$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      const patched = src.replace('export const ROOM_DOOR_WIDTH = 1.4;', 'export const ROOM_DOOR_WIDTH = 1.8;');
      if (patched === src) throw new Error('ROOM_DOOR_WIDTH not found');
      return { contents: patched, loader: 'ts' };
    });
    b.onResolve({ filter: /gameanalytics/ }, () => ({ path: 'ga-stub', namespace: 'nx' }));
    b.onLoad({ filter: /.*/, namespace: 'nx' }, (args) => ({
      contents: args.path === 'music-stub' ? 'export const MUSIC = { data: "", loopSeconds: 48 };' : 'export default {};',
      loader: 'js',
    }));
  },
};

const result = await build({
  entryPoints: [resolve(root, 'src/playable/main.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  minify: process.env.MINIFY !== '0',
  write: false,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"',
    __GA_GAME_KEY__: '""',
    __GA_SECRET_KEY__: '""',
    // The app icon for the start screen and the corner badge (inlined: the ad makes no requests).
    // The no-tutorial variant (NO_TUTORIAL=1): play from the first touch, built to its own file.
    __NO_TUTORIAL__: noTutorial ? 'true' : 'false',
    __ICON__: JSON.stringify(`data:image/png;base64,${readFileSync(resolve(root, 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png')).toString('base64')}`),
  },
  logLevel: 'warning',
  plugins: [noMusic],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(resolve(root, 'src/playable/ad.css'), 'utf8');
const jost = readFileSync(resolve(root, 'node_modules/@fontsource-variable/jost/files/jost-latin-wght-normal.woff2')).toString('base64');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no">
${google ? `<!-- Google Ads (HTML5) reads these two. -->
<meta name="ad.size" content="width=320,height=480">
<meta name="ad.orientation" content="portrait,landscape">
` : ''}<title>Night Express</title>
<script>
/* ============================================================================================
   AD NETWORK SETTINGS: change these lines only.
   network:    'unity' | 'applovin' | 'meta' | 'google'
                 unity, applovin -> mraid.open(storeUrl)   (MRAID is injected by the network)
                 meta            -> FbPlayableAd.onCTAClick()
                 google          -> ExitApi.exit()          (the google build includes exitapi.js)
   iosUrl / androidUrl: the store pages Install and Play Now open (Unity / AppLovin; Meta and
               Google take the link from the campaign). An empty iosUrl uses androidUrl.
   ============================================================================================ */
window.NX_AD = {
  network: '${network}',
  iosUrl: '${IOS_URL}',
  androidUrl: '${ANDROID_URL}'
};
</script>
${google ? `<!-- Google Ads requires its exit API (the file's only external reference; no other network gets it). -->
<script type="text/javascript" src="https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"></script>
` : ''}<style>
@font-face { font-family: 'Jost'; font-style: normal; font-weight: 100 900; font-display: block; src: url(data:font/woff2;base64,${jost}) format('woff2'); }
${css}
</style>
</head>
<body>
<canvas id="scene" aria-label="Night Express"></canvas>
<div id="vignette"></div>
<div id="ui"></div>
<script>
${js}
</script>
</body>
</html>
`;
mkdirSync(resolve(root, 'playable'), { recursive: true });
const out = resolve(root, `playable/${fileName}`);
writeFileSync(out, page);
console.log(`Built playable/${fileName} (${(Buffer.byteLength(page) / 1024).toFixed(0)} KB, network: ${network})`);
