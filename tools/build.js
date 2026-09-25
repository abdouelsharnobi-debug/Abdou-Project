/*
 * Bundle into offline single files:
 *   dist/ColdLoadPro.html            — application v2
 *   dist/legacy/ColdLoadPro-v1.html  — previous version (rollback)
 *   dist/Launch ColdLoad Pro.bat     — Windows launcher (Edge/Chrome app window)
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function bundle(htmlFile, outFile) {
  const dir = path.dirname(path.join(root, htmlFile));
  let html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${fs.readFileSync(path.join(dir, href), 'utf8')}\n</style>`);
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${fs.readFileSync(path.join(dir, src), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
  const out = path.join(root, outFile);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`Wrote ${outFile} (${(html.length / 1024).toFixed(0)} kB)`);
}

bundle('index.html', 'dist/ColdLoadPro.html');
bundle('legacy/index.html', 'dist/legacy/ColdLoadPro-v1.html');
fs.copyFileSync(path.join(__dirname, 'launcher.bat'), path.join(root, 'dist', 'Launch ColdLoad Pro.bat'));
