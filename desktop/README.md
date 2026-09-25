# ColdLoad Pro: Windows desktop shell

This is an Electron wrapper around the single-file app (`dist/ColdLoadPro.html`). None of the calculation code lives here. `build/prepare.js` rebuilds the bundle and copies it to `app/index.html`.

```
npm install
npm start          # run on this machine (any OS)
npm run dist:win   # NSIS installer and portable exe in release/ (on Linux this needs wine64 and wine32)
```

| File | Role |
|---|---|
| `main.js` | Window setup and the `app://coldload` protocol (CSP, path-traversal check), plus the menu, logging and single-instance lock. It also handles the IPC calls: native save, printToPDF, open / show in folder, and backups. |
| `preload.js` | `window.desktop` bridge, the only API the page sees (no Node.js). |
| `build/icon.*` | Application icon. |

Test hooks: `COLDLOAD_USER_DATA` (data folder) and `COLDLOAD_TEST_SAVE_DIR`, which skips the Save dialogs. QA: `tests/desktop/desktop-e2e.js`.
