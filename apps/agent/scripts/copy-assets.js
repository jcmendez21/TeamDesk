// Copies static renderer assets (HTML, future CSS/images) into dist/
// alongside the compiled JS so Electron can load them from one tree.
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'src', 'renderer');
const dst = path.join(__dirname, '..', 'dist', 'renderer');

fs.mkdirSync(dst, { recursive: true });
for (const file of fs.readdirSync(src)) {
  if (file.endsWith('.ts')) continue; // compiled by tsc
  fs.cpSync(path.join(src, file), path.join(dst, file));
  console.log(`copied ${file}`);
}
