/*
 * Desktop: "new version available" notice and the Settings → Storage "App version & updates" card.
 * The app only checks whether a newer version is published; the user downloads and installs it.
 */
(function (root) {
  'use strict';
  const CL = root.CL, App = CL.App;
  const { h, btn, toast, alertDlg, fdate } = CL.ui;
  const bridge = () => root.desktop && root.desktop.version;

  function notify(info) {
    toast(`A new version of ColdLoad Pro is available (${info.version}, ${fdate(info.builtAt, true)}). Download it and install it over this one — your projects are kept.`, 'info', 60000, [
      { label: 'Download', run: () => openDownload() },
      { label: 'Later', run: () => bridge().dismiss(info.builtAt) },
    ]);
  }
  async function openDownload() {
    await bridge().openDownloadPage();
    await alertDlg('Installing the new version', h('ol', {},
      h('li', {}, 'On the page that opened, click the file for this computer: Windows → “ColdLoad-Pro-Setup-….exe”; Mac with Apple chip → “…mac-arm64.dmg”; Intel Mac → “…mac-x64.dmg”.'),
      h('li', {}, 'Close ColdLoad Pro (save your work first).'),
      h('li', {}, 'Open the downloaded file and install as before (Windows: Next → Install; Mac: drag to Applications and choose Replace).'),
      h('li', {}, 'Open ColdLoad Pro. Your projects, settings and sync are kept.')));
  }

  function start() {
    const b = bridge();
    if (!b) return;
    b.onAvailable(notify);
  }

  async function card() {
    const b = bridge();
    if (!b) return null;
    const st = await b.status();
    const last = st.last;
    const lastTxt = !st.lastCheck ? 'Not yet' : `${fdate(st.lastCheck, true)} — ${last && last.status === 'available' ? `version ${last.version} (${fdate(last.builtAt, true)}) is available` : last && last.status === 'up-to-date' ? 'you have the latest version' : last && last.error ? `could not check (${last.error})` : ''}`;
    return h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, 'App version & updates'), h('small', { class: 'muted' }, `ColdLoad Pro ${st.installed.version}`)),
      h('table', { class: 'kv' }, ...[
        ['Installed version', `${st.installed.version}${st.installed.builtAt ? ` — built ${fdate(st.installed.builtAt, true)}` : ''}`],
        ['Last check', lastTxt],
        ['Notices', st.notice ? 'On — the app checks at start-up and every 6 hours and tells you when a new version is published' : 'Off'],
      ].map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))),
      h('div', { class: 'row' },
        btn('Check for a new version', async () => {
          const r = await b.check();
          if (r.status === 'available') notify(r);
          else if (r.status === 'up-to-date') toast('You have the latest version.', 'ok');
          else toast(`Could not check: ${r.error || r.status}`, 'warn', 6000);
          App.rerender();
        }, { kind: 'primary', icon: 'sync' }),
        btn('Open download page', () => openDownload(), { icon: 'backup' }),
        btn(st.notice ? 'Turn notices off' : 'Turn notices on', async () => { await b.setNotice(!st.notice); App.rerender(); }, { icon: 'settings' })),
      h('p', { class: 'muted small' }, 'Nothing is downloaded or installed automatically. When you install a new version over the old one, your projects, settings and sync are kept. Install the same version on both computers.'));
  }

  CL.updateUI = { start, card };
})(globalThis);
