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

// Build identity (dist/update.json): lets installed desktop apps tell the user when a newer version is published.
// builtAt only moves when the bundle changes.
{
  const crypto = require('crypto');
  const V = require('../js/core/version.js');
  const buf = fs.readFileSync(path.join(root, 'dist', 'ColdLoadPro.html'));
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const file = path.join(root, 'dist', 'update.json');
  let prev = null; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* first build */ }
  const m = { format: 'coldload-update', version: V.APP_VERSION, builtAt: prev && prev.sha256 === sha ? prev.builtAt : new Date().toISOString(), sha256: sha, engineVersion: V.ENGINE_VERSION };
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
  console.log(`Wrote dist/update.json (${m.version}, ${m.builtAt})`);
}
fs.copyFileSync(path.join(__dirname, 'launcher.bat'), path.join(root, 'dist', 'Launch ColdLoad Pro.bat'));
