// Firefox build: each script entry is bundled as a self-contained IIFE
// (content scripts and the Firefox event page cannot share ES-module chunks).
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });

const scripts = {
  background: 'src/background/index.ts',
  'content-wealthsimple': 'src/content/index.ts',
  'content-accesd': 'src/content/accesd.ts',
  popup: 'src/popup/index.ts',
};

for (const [name, entry] of Object.entries(scripts)) {
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: false,
      lib: { entry: path.join(root, entry), name: `ws_${name.replace(/\W/g, '_')}`, formats: ['iife'], fileName: () => `${name}.js` },
    },
  });
}

// Popup HTML: point at the bundled script (classic script, no module).
const html = fs.readFileSync(path.join(root, 'src/popup/index.html'), 'utf8')
  .replace('<script src="./index.ts" type="module"></script>', '<script src="../popup.js"></script>');
fs.mkdirSync(path.join(out, 'popup'), { recursive: true });
fs.writeFileSync(path.join(out, 'popup/index.html'), html);
fs.cpSync(path.join(root, 'assets/icons'), path.join(out, 'assets/icons'), { recursive: true });

const rewrite = { 'src/content/index.ts': 'content-wealthsimple.js', 'src/content/accesd.ts': 'content-accesd.js' };
manifest.action.default_popup = 'popup/index.html';
manifest.content_scripts = manifest.content_scripts.map(cs => ({ ...cs, js: cs.js.map(f => rewrite[f] ?? f) }));
manifest.background = { scripts: ['background.js'] };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Built Firefox extension in dist/');
