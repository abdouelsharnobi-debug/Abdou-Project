/* Build the web app bundle and place it in desktop/app/ for packaging. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
execFileSync(process.execPath, [path.join(root, 'tools', 'build.js')], { stdio: 'inherit' });
const appDir = path.join(__dirname, '..', 'app');
fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });
fs.copyFileSync(path.join(root, 'dist', 'ColdLoadPro.html'), path.join(appDir, 'index.html'));
fs.copyFileSync(path.join(root, 'dist', 'update.json'), path.join(appDir, 'update.json'));
console.log('Prepared desktop/app/index.html');
