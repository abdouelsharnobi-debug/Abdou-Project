/* Bundle index.html + css + js into one offline file: dist/ColdLoadPro.html */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  `<style>\n${fs.readFileSync(path.join(root, href), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'ColdLoadPro.html');
fs.writeFileSync(out, html);
fs.copyFileSync(path.join(__dirname, 'launcher.bat'), path.join(root, 'dist', 'Launch ColdLoad Pro.bat'));
console.log(`Wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} kB)`);
